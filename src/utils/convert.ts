import {
  TraktLibrary,
  TraktLibraryObject,
  TraktMovieAddToList,
  TraktShowAddToList,
  TraktShowSeasonAddToList,
} from "./trakt";
// @ts-ignore
import watchedBitfield from "stremio-watched-bitfield";
import { GroupedStremioWithTraktObject } from "./sync";
import {
  StremioAPIClient,
  StremioCinemataMetaSeriesData,
  StremioLibraryObject,
} from "./stremio";

const backfill_lastepisodefill = false;

export function convertStremioDateToTrakt(date: string) {
  return date.split("T")[0] + " " + date.split("T")[1].split(".")[0];
}

export function convertTraktLibraryToTraktLibraryObjectArray(
  traktLibrary: TraktLibrary,
): TraktLibraryObject[] {
  return [...traktLibrary.movies, ...traktLibrary.shows];
}

export function convertFromStremioLibraryToTraktListMovie(
  stremio: StremioLibraryObject,
) {
  let movieObject: TraktMovieAddToList = {
    title: stremio.name,
    ids: { imdb: stremio._id },
  };
  movieObject.watched_at = convertStremioDateToTrakt(stremio.state.lastWatched);
  return movieObject;
}

export function convertFromStremioLibraryToTraktListShow(
  stremio: StremioLibraryObject,
) {
  let showObject: TraktShowAddToList = {
    title: stremio.name,
    ids: { imdb: stremio._id },
  };
  return showObject;
}

export function convertFromStremioLibraryToTraktList(
  libraryObjects: GroupedStremioWithTraktObject[],
  filter?: (
    value: GroupedStremioWithTraktObject,
    index?: number,
    array?: GroupedStremioWithTraktObject[],
  ) => unknown,
) {
  let shows: TraktShowAddToList[] = [];
  let movies: TraktMovieAddToList[] = [];

  if (!filter) {
    filter = () => true;
  }

  const filtered = libraryObjects.filter(filter);

  for (let s = 0; s < filtered.length; s++) {
    const e = filtered[s];
    if (!e.stremio) {
      continue;
    }
    if (e.stremio.type === "movie") {
      let movie = convertFromStremioLibraryToTraktListMovie(e.stremio);
      if (movie) {
        movies.push(movie);
      }
    } else if (e.stremio.type === "series") {
      let show = convertFromStremioLibraryToTraktListShow(e.stremio);
      if (show) {
        shows.push(show);
      }
    }
  }
  return { shows, movies };
}

export function convertFromStremioLibraryToTraktWatchHistoryMovie(
  stremio: StremioLibraryObject,
) {
  let movieObject: TraktMovieAddToList = {
    ids: { imdb: stremio._id },
  };
  movieObject.watched_at = convertStremioDateToTrakt(stremio.state.lastWatched);
  return movieObject;
}

function convertCinemetaMetaValuesToStremioVideoId(
  cinemeta: StremioCinemataMetaSeriesData | undefined,
  id: string,
) {
  if (!cinemeta) {
    return [];
  }

  return cinemeta.meta.videos
    .filter((e) => e.season > 0)
    .concat(cinemeta.meta.videos.filter((e) => e.season === 0))
    .map((v) => id + ":" + v.season + ":" + v.number);
}

export async function convertCinemataToStremioWatchedBitField(
  stremio: StremioLibraryObject,
) {
  const cinemataValues = await StremioAPIClient.getCinemetaMeta(stremio._id);
  if (!cinemataValues) {
    throw "Not found";
  }

  const episodeList = convertCinemetaMetaValuesToStremioVideoId(
    cinemataValues,
    stremio._id,
  );

  let wb: any;
  if (stremio.state.watched) {
    wb = watchedBitfield.constructAndResize(
      stremio.state.watched,
      episodeList || [],
    );
  }
  return { episodeList, wb };
}

export async function convertFromStremioLibraryToTraktWatchHistoryShow(
  stremio: StremioLibraryObject,
) {
  let showObject: TraktShowAddToList = {
    ids: { imdb: stremio._id },
    watched_at: stremio.state.lastWatched,
  };

  let episodeList: string[] = [];
  let wb: any = null;

  if (!backfill_lastepisodefill) {
    try {
      let response = await convertCinemataToStremioWatchedBitField(stremio);
      episodeList = response.episodeList;
      wb = response.wb;
    } catch (e) {
      console.log(e);
    }
  }

  showObject.seasons = [];
  for (
    let i = 0;
    i <
    (stremio.state.watched
      ? parseInt(stremio.state.watched.split(":")[1])
      : stremio.state.season);
    i++
  ) {
    let season: TraktShowSeasonAddToList = {
      number: i + 1,
    };
    if (backfill_lastepisodefill) {
      season.watched_at = stremio.state.lastWatched;
      if (stremio.state.season === i + 1) {
        season.episodes = [];
        for (let j = 0; j < stremio.state.episode; j++) {
          let episode = j + 1;
          season.episodes.push({
            number: episode,
          });
        }
      }
    } else {
      season.episodes = [];
      episodeList
        .filter((v) => v.split(":")[1] === season.number?.toString())
        .forEach((ep) => {
          const splitEp = parseInt(ep.split(":")[2]);
          if (wb && wb.getVideo(ep)) {
            if (season.episodes && !season.episodes[splitEp - 1]) {
              season.episodes.push({ number: splitEp });
            }
          }
        });
    }
    showObject.seasons.push(season);
  }
  return showObject;
}

export async function convertFromStremioLibraryToTraktWatchHistory(
  libraryObjects: GroupedStremioWithTraktObject[],
  filter?: (
    value: GroupedStremioWithTraktObject,
    index?: number,
    array?: GroupedStremioWithTraktObject[],
  ) => unknown,
) {
  let shows: TraktShowAddToList[] = [];
  let movies: TraktMovieAddToList[] = [];

  if (!filter) {
    filter = () => true;
  }

  const filtered = libraryObjects.filter(filter);

  for (let s = 0; s < filtered.length; s++) {
    const e = filtered[s];
    if (!e.stremio) {
      continue;
    }
    if (e.stremio.type === "movie") {
      const movie = convertFromStremioLibraryToTraktWatchHistoryMovie(
        e.stremio,
      );
      if (movie) {
        movies.push(movie);
      }
    } else if (e.stremio.type === "series") {
      const show = await convertFromStremioLibraryToTraktWatchHistoryShow(
        e.stremio,
      );
      if (show) {
        shows.push(show);
      }
    }
  }
  return { shows, movies };
}
