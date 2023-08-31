import {
  convertFromStremioLibraryToTraktList,
  convertFromStremioLibraryToTraktWatchHistory,
  convertTraktLibraryToTraktLibraryObjectArray,
} from "./convert";
import { TraktAPIClient, TraktLibraryObject } from "./trakt";
import { StremioAPIClient, StremioLibraryObject } from "./stremio";
import config from "../../config.json";

const traktSettings = config;

export interface GroupedStremioWithTraktObject {
  stremio?: StremioLibraryObject;
  trakt?: TraktLibraryObject;
}

function groupStremioWithTrakt(
  stremioLibrary: StremioLibraryObject[],
  traktLibrary: TraktLibraryObject[],
) {
  const groupedStremioObject = stremioLibrary.reduce<
    Record<string, { stremio: StremioLibraryObject }>
  >((accum, obj) => {
    const id = obj._id;
    if (!accum[id]) accum[id] = { stremio: obj };
    return accum;
  }, {});

  const groupedStremioWithTraktObject = traktLibrary.reduce<
    Record<string, GroupedStremioWithTraktObject>
  >((accum, obj) => {
    let id = "";
    if (obj.show) {
      id = obj.show.ids.imdb;
    } else if (obj.movie) {
      id = obj.movie.ids.imdb;
    }
    if (!accum[id]) accum[id] = { trakt: obj };
    else accum[id] = { ...accum[id], trakt: obj };
    return accum;
  }, groupedStremioObject);

  return Object.values(groupedStremioWithTraktObject);
}

function stremioToTraktListSyncLogic(
  force: boolean,
): (value: GroupedStremioWithTraktObject) => boolean | void {
  return (value: GroupedStremioWithTraktObject): boolean | void => {
    if (!value.stremio) {
      return;
    }
    if (!value.trakt) {
      return true;
    }
    if (
      (traktSettings.backfill_listmovies || force) &&
      value.stremio.type === "movie"
    ) {
      if (traktSettings.backfill_modifylist) {
        return true;
      }
      if (
        value.trakt.last_watched_at &&
        new Date(value.trakt.last_watched_at) >
          new Date(value.stremio.state.lastWatched)
      ) {
        return;
      }
      if (
        value.stremio.state.flaggedWatched ||
        (value.stremio.state.lastWatched && value.stremio.state.timesWatched)
      ) {
        return;
      }
      return true;
    }
    if (
      (traktSettings.backfill_listshows || force) &&
      value.stremio.type === "series"
    ) {
      if (traktSettings.backfill_modifylist) {
        return true;
      }
      if (
        value.trakt.last_watched_at &&
        new Date(value.trakt.last_watched_at) >
          new Date(value.stremio.state.lastWatched)
      ) {
        return;
      }
      if (
        value.stremio.state.flaggedWatched ||
        (value.stremio.state.lastWatched && value.stremio.state.timesWatched)
      ) {
        return;
      }
      if (
        value.stremio.state.season !== 0 ||
        value.stremio.state.episode !== 0
      ) {
        return;
      }

      return true;
    }
  };
}

function stremioToTraktWatchHistorySyncLogic(
  value: GroupedStremioWithTraktObject,
): boolean | void {
  if (!value.stremio) {
    return;
  }
  if (
    traktSettings.backfill_watchhistorymovies &&
    value.stremio.type === "movie"
  ) {
    if (!value.trakt) {
      return true;
    }
    if (!value.stremio.state.watched) {
      return;
    }
    if (
      value.trakt.last_watched_at &&
      new Date(value.trakt.last_watched_at) >
        new Date(value.stremio.state.lastWatched)
    ) {
      return;
    }
    if (
      value.stremio.state.flaggedWatched ||
      (value.stremio.state.lastWatched && value.stremio.state.timesWatched)
    ) {
      return true;
    }
  }
  if (
    traktSettings.backfill_watchhistoryshows &&
    value.stremio.type === "series"
  ) {
    if (!value.trakt) {
      return true;
    }
    if (!value.stremio.state.watched) {
      return;
    }
    if (
      value.trakt.last_watched_at &&
      new Date(value.trakt.last_watched_at) >
        new Date(value.stremio.state.lastWatched)
    ) {
      return;
    }
    if (
      value.stremio.state.flaggedWatched ||
      (value.stremio.state.lastWatched && value.stremio.state.timesWatched)
    ) {
      return true;
    }
    if (value.stremio.state.season > 0 || value.stremio.state.episode > 0) {
      return true;
    }
    return;
  }
}

export async function backfillFromStremioToTrakt(
  authKey: string,
  accessToken: string,
  clientId: string,
  force = false,
) {
  const { result: stremioLibrary, authKey: newAuthKey } =
    await StremioAPIClient.getLibrary(authKey);
  const traktLibrary = await TraktAPIClient.getLibrary(accessToken, clientId);

  const groupedLibrary = groupStremioWithTrakt(
    stremioLibrary,
    convertTraktLibraryToTraktLibraryObjectArray(traktLibrary),
  );

  let backfillToList = convertFromStremioLibraryToTraktList(
    groupedLibrary,
    stremioToTraktListSyncLogic(force),
  );

  await TraktAPIClient.updateShowsList(
    accessToken,
    clientId,
    backfillToList.movies,
  );
  await TraktAPIClient.updateShowsList(
    accessToken,
    clientId,
    backfillToList.shows,
  );

  if (
    traktSettings.backfill_watchhistoryshows ||
    traktSettings.backfill_watchhistorymovies ||
    force
  ) {
    let backfillToWatchHistory =
      await convertFromStremioLibraryToTraktWatchHistory(
        groupedLibrary,
        stremioToTraktWatchHistorySyncLogic,
      );

    await TraktAPIClient.updateMoviesHistory(
      accessToken,
      clientId,
      backfillToWatchHistory.movies,
    );
    await TraktAPIClient.updateShowsHistory(
      accessToken,
      clientId,
      backfillToWatchHistory.shows,
    );
  }

  return { authKey: newAuthKey || authKey, accessToken, clientId };
}
