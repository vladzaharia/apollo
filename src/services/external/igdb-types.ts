/**
 * IGDB API response types
 */

export interface IgdbGame {
  id: number;
  name?: string;
  summary?: string;
  first_release_date?: number;
  genres?: IgdbGenre[];
  involved_companies?: IgdbInvolvedCompany[];
  cover?: IgdbCover;
  screenshots?: IgdbScreenshot[];
}

export interface IgdbGenre {
  id: number;
  name: string;
}

export interface IgdbInvolvedCompany {
  id: number;
  company: IgdbCompany;
  developer: boolean;
  publisher: boolean;
}

export interface IgdbCompany {
  id: number;
  name: string;
}

export interface IgdbCover {
  id: number;
  url: string;
}

export interface IgdbScreenshot {
  id: number;
  url: string;
}

export interface IgdbApiResponse<T = unknown> {
  data: T;
}

export interface IgdbClient {
  fields(fields: string[] | string): IgdbClient;
  search(query: string): IgdbClient;
  limit(limit: number): IgdbClient;
  offset(offset: number): IgdbClient;
  sort(field: string, direction?: 'asc' | 'desc'): IgdbClient;
  where(condition: string): IgdbClient;
  request(endpoint: string): Promise<IgdbApiResponse<IgdbGame[]>>;
}
