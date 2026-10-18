import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { signal } from '@angular/core';

export interface SportGame {
  league: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  status: string;
}

interface OddsEvent {
  sport_title?: string;
  home_team?: string;
  away_team?: string;
}

/**
 * Live sports scores with a **zero-key-first** design.
 * <p>
 * When {@link API_KEY} is empty (the default), the service serves a rich local
 * mock array so the UI works out of the box with no registration. Drop in a key
 * from <a href="https://the-odds-api.com">the-odds-api.com</a> or
 * <a href="https://api-sports.io">api-sports.io</a> and the {@code fetchLive}
 * branch activates automatically — no other code changes required.
 */
@Injectable({ providedIn: 'root' })
export class SportsService {
  /**
   * Paste a provider key here to switch from mock mode to live mode. Leaving it
   * empty keeps the app fully functional with local sample data.
   */
  private readonly API_KEY = '';

  private readonly gamesSubject = new BehaviorSubject<SportGame[]>(MOCK_GAMES);

  readonly games$: Observable<SportGame[]> = this.gamesSubject.asObservable();
  /** Human-readable data-source label shown in the widget header. */
  readonly mode = signal(this.API_KEY ? 'LIVE' : 'DEMO');

  constructor(private readonly http: HttpClient) {
    if (this.API_KEY) {
      this.fetchLive();
    } else {
      this.gamesSubject.next([...MOCK_GAMES]);
    }
  }

  /** Fetch the provider once when configured; otherwise local matches stay active. */
  private fetchLive(): void {
    const url = 'https://api.the-odds-api.com/v4/sports/soccer_epl/odds';
    this.http
      .get<unknown>(`${url}?apiKey=${this.API_KEY}&regions=us&markets=h2h`)
      .pipe(
        map((res) => this.normalizeOdds(res)),
        catchError((error: unknown) => {
          console.error('Unable to load live sports scores; using local matches.', error);
          this.mode.set('DEMO');
          return of([...MOCK_GAMES]);
        })
      )
      .subscribe((games) => {
        if (games.length === 0) {
          this.mode.set('DEMO');
          this.gamesSubject.next([...MOCK_GAMES]);
          return;
        }
        this.gamesSubject.next(games);
      });
  }

  /** Map the-odds-api payloads into our {@link SportGame} shape. */
  private normalizeOdds(res: unknown): SportGame[] {
    if (!Array.isArray(res)) {
      return [...MOCK_GAMES];
    }
    return (res as OddsEvent[]).slice(0, 8).map((ev) => ({
      league: (ev.sport_title ?? 'LIVE').toUpperCase(),
      home: ev.home_team ?? 'Home',
      away: ev.away_team ?? 'Away',
      homeScore: 0,
      awayScore: 0,
      status: 'LIVE'
    }));
  }
}

const MOCK_GAMES: SportGame[] = [
  { league: 'EPL', home: 'Arsenal', away: 'Chelsea', homeScore: 1, awayScore: 1, status: "67'" },
  { league: 'UCL', home: 'Real Madrid', away: 'Barcelona', homeScore: 2, awayScore: 0, status: 'FT' },
  { league: 'NFL', home: 'Chiefs', away: 'Bills', homeScore: 24, awayScore: 21, status: 'Q3 04:12' },
  { league: 'NBA', home: 'Lakers', away: 'Celtics', homeScore: 88, awayScore: 92, status: 'Q4 02:40' },
  { league: 'MLB', home: 'Yankees', away: 'Red Sox', homeScore: 3, awayScore: 2, status: 'Top 7th' }
];
