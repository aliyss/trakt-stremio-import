import axios from "axios";
import { delay } from "./delay";

export class TraktAPIClient {
  constructor() {}

  static async updateAccessTokenWithClientId(
    id: string,
    secret: string,
  ): Promise<string> {
    const {
      data: { user_code, verification_url, expires_in, interval },
    } = await axios.post<{
      user_code: string;
      verification_url: string;
      expires_in: number;
      interval: number;
    }>(`https://api.trakt.tv/oauth/device/code`, {
      client_id: id,
    });

    if (!user_code || !verification_url) {
      console.warn(
        "Updating AccessToken - Authenticatation Method: ClientId - FAILED",
      );
      throw new Error("Invalid user_code or verification_url.");
    } else if (!interval || !expires_in) {
      console.warn(
        "Updating AccessToken - Authenticatation Method: ClientId - FAILED",
      );
      throw new Error("Invalid interval or expiry response by api.");
    }

    console.log(
      "Open the link and input your code:\n\nLink: " +
        verification_url +
        "\nCode: " +
        user_code,
    );

    for (let i = 0; i < expires_in; i = i + interval) {
      console.log(
        `(${i / interval}/${
          expires_in / interval
        }) Polling for response every ${interval} seconds.`,
      );
      await delay(interval * 1000);
      const {
        data: { access_token },
      } = await axios.post(`https://api.trakt.tv/oauth/device/token`, {
        code: user_code,
        client_id: id,
        client_secret: secret,
      });
      if (access_token) {
        return access_token;
      }
    }

    throw new Error(
      "Getting the code timed out. Try restarting the application.",
    );
  }

  static async updateAccessToken(
    id: string,
    secret: string,
    accessToken?: string,
  ): Promise<string> {
    if (!accessToken) {
      return await TraktAPIClient.updateAccessTokenWithClientId(id, secret);
    }
    return accessToken;
  }

  static createTraktHeaders(accessToken: string, id: string) {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      "trakt-api-version": 2,
      "trakt-api-key": id,
    };
  }

  static async getList(accessToken: string, id: string) {
    const { data } = await axios.get(`https://api.trakt.tv/sync/watchlist`, {
      headers: TraktAPIClient.createTraktHeaders(accessToken, id),
    });
    let library: TraktLibrary = { movies: [], shows: [] };
    if (data.movies && data.movies.length > 0) {
      library.movies = data.movies;
    }
    if (data.shows && data.shows.length > 0) {
      library.shows = data.shows;
    }
    return library;
  }

  static async getWatched(accessToken: string, id: string) {
    const { data } = await axios.get(
      `https://api.trakt.tv/sync/watched/movies`,
      {
        headers: TraktAPIClient.createTraktHeaders(accessToken, id),
      },
    );
    let library: TraktLibrary = { movies: [], shows: [] };
    if (data.movies && data.movies.length > 0) {
      library.movies = data;
    }
    if (data.shows && data.shows.length > 0) {
      library.shows = data.shows;
    }
    return library;
  }

  static async getLibrary(
    accessToken: string,
    id: string,
  ): Promise<TraktLibrary> {
    let list = await TraktAPIClient.getList(accessToken, id);
    let watched = await TraktAPIClient.getWatched(accessToken, id);
    return {
      movies: [...list.movies, ...watched.movies],
      shows: [...list.shows, ...watched.shows],
    };
  }

  static async updateShowsList(
    accessToken: string,
    id: string,
    shows: TraktShowAddToList[],
  ) {
    if (shows.length <= 0) {
      return;
    }
    const { data } = await axios.post(
      "https://api.trakt.tv/sync/watchlist",
      { shows: shows },
      { headers: TraktAPIClient.createTraktHeaders(accessToken, id) },
    );
    return data;
  }

  static async updateMoviesList(
    accessToken: string,
    id: string,
    movies: TraktMovieAddToList[],
  ) {
    if (movies.length <= 0) {
      return;
    }
    const { data } = await axios.post(
      "https://api.trakt.tv/sync/watchlist",
      { movies: movies },
      { headers: TraktAPIClient.createTraktHeaders(accessToken, id) },
    );
    return data;
  }

  static async updateShowsHistory(
    accessToken: string,
    id: string,
    shows: TraktShowAddToList[],
  ) {
    if (shows.length <= 0) {
      return;
    }
    const { data } = await axios.post(
      "https://api.trakt.tv/sync/history",
      { shows: shows },
      { headers: TraktAPIClient.createTraktHeaders(accessToken, id) },
    );
    return data;
  }

  static async updateMoviesHistory(
    accessToken: string,
    id: string,
    movies: TraktMovieAddToList[],
  ) {
    if (movies.length <= 0) {
      return;
    }
    const { data } = await axios.post(
      "https://api.trakt.tv/sync/history",
      { movies: movies },
      { headers: TraktAPIClient.createTraktHeaders(accessToken, id) },
    );
    return data;
  }
}

export interface TraktMovieAddToList {
  title?: string;
  ids: {
    imdb: string;
  };
  watched_at?: string;
}

export interface TraktShowEpisodeAddToList {
  number?: number;
  watched_at?: string;
}

export interface TraktShowSeasonAddToList {
  number?: number;
  watched_at?: string;
  episodes?: TraktShowEpisodeAddToList[];
}

export interface TraktShowAddToList {
  title?: string;
  ids: {
    imdb: string;
  };
  watched_at?: string;
  seasons?: TraktShowSeasonAddToList[];
}

export interface TraktLibraryObjectShow {
  title: string;
  poster: string;
  year: number;
  ids: {
    trakt: number;
    imdb: string;
  };
}

export interface TraktLibraryObjectMovie {
  title: string;
  poster: string;
  year: number;
  ids: {
    trakt: number;
    imdb: string;
  };
}

export interface TraktLibraryObjectBase {
  last_watched_at: string | null;
  last_updated_at: string | null;
}

export interface TraktLibraryShowObject extends TraktLibraryObjectBase {
  show: TraktLibraryObjectShow;
}

export interface TraktLibraryMovieObject extends TraktLibraryObjectBase {
  movie: TraktLibraryObjectMovie;
}

export type TraktLibraryObject = TraktLibraryObjectBase & {
  show?: TraktLibraryObjectShow;
  movie?: TraktLibraryObjectMovie;
};

export interface TraktLibrary {
  movies: TraktLibraryMovieObject[];
  shows: TraktLibraryShowObject[];
}
