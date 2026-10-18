import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { SpinVaultGame, SpinVaultService } from '../../core/services/spinvault.service';
import { ChatModalComponent } from './chat-modal.component';

const FEATURED_GAMES: SpinVaultGame[] = [
  { id: 'juwa', title: 'Juwa', logo_url: null, download_url: null },
  { id: 'gamevault', title: 'GameVault', logo_url: null, download_url: null },
  { id: 'orion-stars', title: 'Orion Stars', logo_url: null, download_url: null },
  { id: 'neon-reels', title: 'Neon Reels', logo_url: null, download_url: null },
  { id: 'lucky-orbit', title: 'Lucky Orbit', logo_url: null, download_url: null },
  { id: 'starfall-slots', title: 'Starfall Slots', logo_url: null, download_url: null },
  { id: 'pixel-jackpot', title: 'Pixel Jackpot', logo_url: null, download_url: null },
  { id: 'cosmic-spin', title: 'Cosmic Spin', logo_url: null, download_url: null },
  { id: 'moonlight-arcade', title: 'Moonlight Arcade', logo_url: null, download_url: null },
  { id: 'vault-rush', title: 'Vault Rush', logo_url: null, download_url: null }
];

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink, ChatModalComponent],
  template: `
    <main class="sv-page">
      <header class="sv-nav">
        <a class="sv-brand" routerLink="/" aria-label="SpinVault home">
          <svg class="sv-brand-mark" viewBox="0 0 40 40" role="img" aria-label="SpinVault">
            <path d="M20 2.5 36 11.7v16.6L20 37.5 4 28.3V11.7L20 2.5Z" fill="rgba(255,0,127,.12)" stroke="currentColor" stroke-width="1.5"/>
            <path d="m24.7 12.5-9.1 1.2a4.1 4.1 0 0 0-.5 8.1l8.1 2a2.1 2.1 0 0 1-.5 4.1l-8.9 1.2" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
            <path d="M8 20h4m16 0h4" stroke="#00f3ff" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <span>Spin<span>Vault</span></span>
        </a>
        <nav class="sv-nav-links" aria-label="Main navigation">
          <a routerLink="/" fragment="home">Home</a>
          <a routerLink="/" fragment="games">Games</a>
          <a routerLink="/how-to-play">How to play</a>
        </nav>
        <div class="sv-nav-actions">
          @if (identity) {
            <span class="sv-user-label">Hi, {{ identity.username }}</span>
            @if (identity.role === 'admin') {
              <a class="sv-admin-link" routerLink="/admin">Admin</a>
            }
            <button class="sv-login-btn" type="button" (click)="signOut()">Log out</button>
          } @else {
            <button class="sv-login-btn" type="button" (click)="openChat()">Log in</button>
          }
          <button class="sv-button sv-button-small" type="button" (click)="openChat()">{{ identity?.role === 'admin' ? 'Chat with Users' : 'Chat with us' }} <span>↗</span></button>
        </div>
      </header>

      <button class="sv-referral-banner" type="button" (click)="openChat()">🎁 Refer friends and get a <strong>20% bonus</strong> on your next load! <span>Ask us how →</span></button>

      <section id="home" class="sv-hero">
        <div class="sv-hero-copy">
          <div class="sv-eyebrow"><span class="sv-live-dot"></span> YOUR NEXT FAVORITE GAME STARTS HERE</div>
          <h1>Spin it.<br /><span>Reel it.</span> Win it.</h1>
          <p class="sv-hero-subtitle">Your game night, upgraded. Discover the games everyone’s talking about and get friendly, one-on-one support whenever you need it.</p>
          <div class="sv-hero-actions">
            <a class="sv-button" routerLink="/" fragment="games">Explore games <span>→</span></a>
            <button class="sv-secondary-button" type="button" (click)="openChat()"><span class="sv-chat-icon">⌁</span> Talk to our team</button>
          </div>
          <div class="sv-trust-row">
            <div class="sv-avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div>
            <div><strong>Real people, ready to help</strong><small>Direct support, just one message away</small></div>
          </div>
        </div>
        <div class="sv-hero-art" aria-label="Neon slot machine illustration">
          <div class="sv-orbit sv-orbit-one"></div><div class="sv-orbit sv-orbit-two"></div>
          <div class="sv-art-star star-a">✦</div><div class="sv-art-star star-b">✧</div>
          <div class="sv-slot-machine">
            <div class="sv-slot-top"><span>SPINVAULT</span><span>★ ★ ★</span></div>
            <div class="sv-slot-window"><span>7</span><span>★</span><span>7</span></div>
            <div class="sv-slot-controls"><i></i><i></i><i></i></div>
            <div class="sv-slot-base"></div>
          </div>
          <div class="sv-floating-chip sv-chip-pink">✦ BONUS</div>
          <div class="sv-floating-chip sv-chip-cyan">LET’S PLAY <span>↗</span></div>
        </div>
        <div class="sv-scroll-note"><span></span> SCROLL TO EXPLORE</div>
      </section>

      <section class="sv-features" aria-label="Why SpinVault">
        <button class="sv-feature-card" type="button" (click)="scrollToGames()"><span class="sv-feature-icon icon-cyan">◉</span><span class="sv-feature-copy"><h2>Games you love</h2><p>Find fan favorites, all in one place.</p></span><span class="sv-card-arrow">↗</span></button>
        <button class="sv-feature-card" type="button" (click)="openChat()"><span class="sv-feature-icon icon-pink">⌁</span><span class="sv-feature-copy"><h2>Real-time support</h2><p>Chat directly with a real person.</p></span><span class="sv-card-arrow">↗</span></button>
        <button class="sv-feature-card" type="button" (click)="guideOpen = true"><span class="sv-feature-icon icon-purple">◈</span><span class="sv-feature-copy"><h2>Easy to get started</h2><p>Follow a few simple steps and play.</p></span><span class="sv-card-arrow">↗</span></button>
      </section>

      <section id="games" class="sv-games-section">
        <div class="sv-section-heading">
          <div><div class="sv-eyebrow">PICK YOUR NEXT ADVENTURE</div><h2>Game <span>gallery</span></h2></div>
          <button class="sv-text-link" type="button" (click)="loadGames()">Refresh <span>↻</span></button>
        </div>
        @if (gameError) { <p class="sv-inline-notice" role="status">{{ gameError }} Showing featured games.</p> }
        <div class="sv-game-grid" role="list">
          @for (game of games; track game.id; let index = $index) {
            <article class="sv-game-item" role="listitem">
              <span class="sv-game-thumb" [class]="'sv-game-thumb tone-' + (index % 6)">
                <span aria-hidden="true">{{ game.title.slice(0, 1).toUpperCase() }}</span>
                @if (game.logo_url) { <img [src]="game.logo_url" [alt]="game.title + ' icon'" width="44" height="44" loading="lazy" decoding="async" (error)="onGameIconError($event)" /> }
              </span>
              <span class="sv-game-title">{{ game.title }}</span>
              @if (game.download_url) {
                <a class="sv-play-button" [href]="game.download_url" target="_blank" rel="noopener noreferrer">Play / Download <span>↗</span></a>
              } @else {
                <button class="sv-play-button sv-play-disabled" type="button" disabled aria-label="Download link not configured">Coming soon</button>
              }
            </article>
          }
        </div>
        <p class="sv-games-footnote">Game links are provided by the SpinVault team. Availability may vary by device and region.</p>
      </section>

      <section class="sv-bottom-cta">
        <div><div class="sv-eyebrow">NEED A HAND?</div><h2>We’re just a message away.</h2><p>Our team is here to make your next game night easy.</p></div>
        <button class="sv-button" type="button" (click)="openChat()">Chat with us <span>↗</span></button>
        <div class="sv-cta-glow"></div>
      </section>
      <footer class="sv-footer"><a class="sv-brand" routerLink="/"><span class="sv-brand-mark">S</span><span>Spin<span>Vault</span></span></a><span>Play for fun. Play responsibly.</span><a routerLink="/how-to-play">How to play</a></footer>
      @if (guideOpen) {
        <div class="sv-guide-backdrop" (click)="guideOpen = false">
          <section class="sv-guide-modal" role="dialog" aria-modal="true" aria-labelledby="guide-title" (click)="$event.stopPropagation()">
            <button class="sv-guide-close" type="button" aria-label="Close guide" (click)="guideOpen = false">×</button>
            <div class="sv-eyebrow">THREE QUICK STEPS</div><h2 id="guide-title">Ready, set, <span>play.</span></h2>
            <ol><li><b>01</b><span><strong>Choose a game</strong><small>Browse the gallery and pick your favorite.</small></span></li><li><b>02</b><span><strong>Get set up</strong><small>Open the download link and follow its setup steps.</small></span></li><li><b>03</b><span><strong>Need a hand?</strong><small>Chat with our team for one-on-one support.</small></span></li></ol>
            <button class="sv-button" type="button" (click)="guideOpen = false; openChat()">Chat with us <span>↗</span></button>
          </section>
        </div>
      }
      <app-chat-modal [open]="chatOpen" (closed)="chatOpen = false" />
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f6f4ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
    *{box-sizing:border-box}.sv-page{position:relative;overflow:hidden;padding:0 24px;background:radial-gradient(ellipse at 75% 15%,rgba(46,24,87,.25),transparent 42%),#0b0c1b}
    .sv-nav{height:82px;max-width:1160px;margin:auto;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.075);position:relative;z-index:3}
    .sv-brand{display:inline-flex;align-items:center;gap:10px;color:#fff;text-decoration:none;font-size:19px;font-weight:800;letter-spacing:-.7px}.sv-brand>span:last-child>span{color:#ff2c93}
    .sv-brand-mark{width:34px;height:34px;flex:none;color:#ff3a9e;filter:drop-shadow(0 0 7px rgba(255,0,127,.65)) drop-shadow(0 0 12px rgba(0,243,255,.25));transition:filter .2s,transform .2s}.sv-brand:hover .sv-brand-mark{transform:rotate(-7deg);filter:drop-shadow(0 0 10px rgba(255,0,127,.85)) drop-shadow(0 0 16px rgba(0,243,255,.4))}
    .sv-nav-links{display:flex;gap:35px}.sv-nav-links a,.sv-admin-link{color:#aaa9bf;text-decoration:none;font-size:13px;transition:color .2s}.sv-nav-links a:hover,.sv-admin-link:hover{color:#fff}
    .sv-nav-actions{display:flex;align-items:center;gap:16px}.sv-login-btn{background:none;border:0;color:#dddcec;font:inherit;font-size:13px;cursor:pointer}.sv-user-label{color:#b9b7cf;font-size:12px}.sv-admin-link{color:#00dce8}
    .sv-button,.sv-secondary-button{display:inline-flex;align-items:center;justify-content:center;gap:13px;border:0;border-radius:9px;padding:14px 20px;background:linear-gradient(100deg,#ff007f,#d809a2);box-shadow:0 7px 27px rgba(255,0,127,.24);color:#fff;font-size:13px;font-weight:750;text-decoration:none;cursor:pointer;transition:transform .2s,box-shadow .2s}
    .sv-button:hover,.sv-secondary-button:hover{transform:translateY(-2px);box-shadow:0 10px 32px rgba(255,0,127,.37)}.sv-button-small{padding:11px 15px;font-size:12px}.sv-secondary-button{background:rgba(16,18,39,.7);border:1px solid rgba(0,243,255,.25);box-shadow:none;color:#ecfaff}
    .sv-secondary-button .sv-chat-icon{font-size:21px;color:#00f3ff;line-height:12px}
    .sv-referral-banner{display:block;width:min(1160px,100%);margin:12px auto 0;padding:11px 16px;border:1px solid rgba(255,0,127,.32);border-radius:9px;background:linear-gradient(100deg,rgba(255,0,127,.12),rgba(0,243,255,.055));color:#f8e8f2;text-align:center;font:700 11px Inter,ui-sans-serif,system-ui,sans-serif;cursor:pointer;transition:border-color .2s,transform .2s}.sv-referral-banner:hover{border-color:rgba(255,0,127,.65);transform:translateY(-1px)}.sv-referral-banner strong{color:#ff52a7}.sv-referral-banner span{margin-left:7px;color:#00e6ed;font-size:10px}
    .sv-hero{max-width:1160px;min-height:548px;margin:auto;display:grid;grid-template-columns:1fr 1fr;align-items:center;position:relative;padding:50px 0 72px}
    .sv-hero-copy{position:relative;z-index:2;padding-bottom:18px}.sv-eyebrow{color:#00dce8;font-size:10px;font-weight:800;letter-spacing:2.1px;display:flex;align-items:center;gap:9px}
    .sv-live-dot{width:7px;height:7px;border-radius:50%;background:#00f3ff;box-shadow:0 0 12px #00f3ff}
    .sv-hero h1{font-size:clamp(51px,7vw,82px);line-height:.99;letter-spacing:-5px;margin:26px 0 20px;font-weight:850}.sv-hero h1 span{color:#ff2c93;text-shadow:0 0 35px rgba(255,0,127,.22)}
    .sv-hero-subtitle{max-width:440px;color:#a7a6bd;font-size:15px;line-height:1.8;margin:0}.sv-hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
    .sv-trust-row{display:flex;align-items:center;gap:13px;margin-top:33px}.sv-avatar-stack{display:flex;padding-left:4px}.sv-avatar-stack span{width:27px;height:27px;margin-left:-4px;border:2px solid #0b0c1b;border-radius:50%;display:grid;place-items:center;background:#33334c;color:#fff;font-size:10px;font-weight:700}.sv-avatar-stack span:nth-child(2){background:#8b2763}.sv-avatar-stack span:nth-child(3){background:#286b7b}.sv-avatar-stack span:last-child{background:#191a31;color:#00f3ff}
    .sv-trust-row strong,.sv-trust-row small{display:block}.sv-trust-row strong{font-size:11px}.sv-trust-row small{color:#77768e;font-size:10px;margin-top:4px}
    .sv-hero-art{height:425px;position:relative;display:grid;place-items:center;isolation:isolate}.sv-orbit{position:absolute;border:1px solid rgba(255,0,127,.18);border-radius:50%;transform:rotate(-28deg);z-index:-1}.sv-orbit-one{width:430px;height:250px}.sv-orbit-two{width:360px;height:330px;border-color:rgba(0,243,255,.14);transform:rotate(44deg)}
    .sv-slot-machine{width:244px;height:285px;position:relative;border:1px solid rgba(0,243,255,.54);border-radius:30px 30px 19px 19px;padding:15px 18px;background:linear-gradient(145deg,#292044,#14152c 55%,#10192b);box-shadow:0 0 24px rgba(0,243,255,.21),inset 0 0 35px rgba(255,0,127,.08),12px 18px 52px #050510}
    .sv-slot-machine:before{content:'';position:absolute;inset:-8px;border:1px solid rgba(255,0,127,.4);border-radius:36px 36px 25px 25px;filter:blur(1px);z-index:-1}
    .sv-slot-top{height:32px;display:flex;justify-content:space-between;align-items:center;color:#00f3ff;font-size:8px;font-weight:900;letter-spacing:1.4px}.sv-slot-top span:last-child{color:#ff43a6;font-size:10px;letter-spacing:1px}
    .sv-slot-window{height:135px;margin-top:17px;border:2px solid rgba(0,243,255,.8);border-radius:12px;background:linear-gradient(135deg,#090b1a,#1b1431);display:flex;align-items:center;justify-content:space-around;box-shadow:inset 0 0 28px rgba(0,243,255,.12),0 0 18px rgba(0,243,255,.21)}
    .sv-slot-window span{font-size:55px;font-weight:900;color:#fff;text-shadow:0 0 11px #ff007f,0 0 23px #ff007f}.sv-slot-window span:nth-child(2){font-size:38px;color:#00f3ff;text-shadow:0 0 14px #00f3ff}
    .sv-slot-controls{display:flex;justify-content:center;gap:15px;margin:15px}.sv-slot-controls i{width:8px;height:8px;border-radius:50%;background:#ff2c93;box-shadow:0 0 9px #ff007f}.sv-slot-controls i:nth-child(2){background:#00f3ff;box-shadow:0 0 9px #00f3ff}.sv-slot-base{position:absolute;bottom:-13px;left:26px;right:26px;height:15px;background:linear-gradient(90deg,#271331,#374354,#271331);border:1px solid #574064;border-radius:0 0 8px 8px}
    .sv-floating-chip{position:absolute;border:1px solid rgba(255,255,255,.13);border-radius:8px;padding:10px 13px;background:rgba(16,17,37,.85);font-size:9px;font-weight:800;letter-spacing:1px;box-shadow:0 10px 25px #060612;backdrop-filter:blur(10px)}
    .sv-chip-pink{top:77px;left:17px;color:#ff4da4;transform:rotate(-8deg)}.sv-chip-cyan{right:1px;bottom:81px;color:#00e8ef;transform:rotate(5deg)}.sv-chip-cyan span{padding-left:8px}
    .sv-art-star{position:absolute;color:#ff3ba1;text-shadow:0 0 13px #ff007f;font-size:25px}.star-a{top:53px;right:91px}.star-b{bottom:57px;left:54px;color:#00f3ff;text-shadow:0 0 14px #00f3ff}
    .sv-scroll-note{position:absolute;left:0;bottom:25px;color:#5d5d76;font-size:8px;font-weight:700;letter-spacing:1.8px;display:flex;align-items:center;gap:9px}.sv-scroll-note span{height:23px;width:1px;background:#ff007f}
    .sv-features{max-width:1160px;margin:0 auto;display:grid;grid-template-columns:repeat(3,1fr);gap:15px}    .sv-feature-card{min-height:91px;border:1px solid rgba(255,255,255,.075);border-radius:12px;padding:19px;display:flex;align-items:center;gap:14px;background:linear-gradient(110deg,rgba(255,255,255,.035),rgba(255,255,255,.01));position:relative;text-align:left;color:inherit;cursor:pointer;transition:transform .18s,border-color .18s,background .18s}.sv-feature-card:hover{transform:translateY(-3px);border-color:rgba(0,243,255,.3);background:linear-gradient(110deg,rgba(0,243,255,.06),rgba(255,255,255,.015))}.sv-feature-copy{flex:1}.sv-feature-copy h2{margin:0;font-size:12px}.sv-feature-copy p{margin:6px 0 0;color:#85849e;font-size:10px}
    .sv-feature-icon{height:39px;width:39px;border-radius:11px;display:grid;place-items:center;font-size:19px;background:rgba(0,243,255,.08)}.icon-cyan{color:#00f3ff}.icon-pink{color:#ff2c93;background:rgba(255,0,127,.09)}.icon-purple{color:#ae83ff;background:rgba(151,100,255,.1)}
    .sv-feature-card h2{margin:0;font-size:12px}.sv-feature-card p{margin:6px 0 0;color:#85849e;font-size:10px}.sv-card-arrow{margin-left:auto;color:#64637c}
    .sv-games-section{max-width:1160px;margin:91px auto 80px}.sv-section-heading{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:25px}.sv-section-heading h2{font-size:34px;letter-spacing:-1.5px;margin:10px 0 0}.sv-section-heading h2 span{color:#ff2c93}.sv-text-link{background:none;border:0;color:#00dce8;font-weight:700;font-size:11px;cursor:pointer}
    .sv-game-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sv-game-item{min-width:0;min-height:65px;display:flex;align-items:center;gap:10px;padding:9px;border:1px solid rgba(255,255,255,.075);border-radius:10px;background:linear-gradient(110deg,rgba(255,255,255,.035),rgba(255,255,255,.01));transition:transform .18s,border-color .18s}.sv-game-item:hover{transform:translateY(-2px);border-color:rgba(0,243,255,.28)}.sv-game-thumb{width:42px;height:42px;flex:none;position:relative;border-radius:10px;display:grid;place-items:center;overflow:hidden;color:white;font-size:17px;font-weight:900;background:linear-gradient(135deg,#612c73,#261c48);box-shadow:inset 0 0 12px rgba(255,255,255,.12)}.sv-game-thumb img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.sv-game-thumb.tone-1{background:linear-gradient(135deg,#176473,#1c2945)}.sv-game-thumb.tone-2{background:linear-gradient(135deg,#76409c,#292047)}.sv-game-thumb.tone-3{background:linear-gradient(135deg,#a52b73,#3e1d50)}.sv-game-thumb.tone-4{background:linear-gradient(135deg,#267858,#1a3641)}.sv-game-thumb.tone-5{background:linear-gradient(135deg,#8c512d,#362442)}.sv-game-title{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px;font-weight:750}.sv-play-button{min-height:31px;flex:none;display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:0 8px;border:1px solid rgba(0,243,255,.24);border-radius:6px;background:rgba(0,243,255,.055);color:#99f8fb;text-decoration:none;font:700 8px Inter,ui-sans-serif,system-ui,sans-serif;white-space:nowrap;cursor:pointer;transition:background .2s,border-color .2s}.sv-play-button:hover:not(:disabled){border-color:rgba(0,243,255,.6);background:rgba(0,243,255,.12)}.sv-play-disabled{border-color:rgba(255,255,255,.08);background:transparent;color:#747389;cursor:not-allowed}.sv-games-footnote{color:#68677f;font-size:10px;margin:12px 0 0}
    .sv-inline-notice{font-size:12px;color:#ffc966;background:rgba(255,180,0,.07);border:1px solid rgba(255,180,0,.2);padding:10px 13px;border-radius:8px;margin-bottom:15px}
    .sv-bottom-cta{max-width:1160px;margin:0 auto 58px;min-height:159px;overflow:hidden;position:relative;border:1px solid rgba(255,0,127,.2);border-radius:16px;padding:29px 36px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(100deg,rgba(255,0,127,.1),rgba(21,21,46,.75) 50%,rgba(0,243,255,.055))}
    .sv-bottom-cta h2{font-size:23px;letter-spacing:-.6px;margin:9px 0}.sv-bottom-cta p{font-size:11px;color:#a3a2b8;margin:0}.sv-bottom-cta .sv-button{z-index:1}.sv-cta-glow{position:absolute;right:20%;top:-130px;width:200px;height:250px;background:#ff007f;opacity:.12;filter:blur(80px)}
    .sv-footer{max-width:1160px;margin:auto;min-height:72px;border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-between}.sv-footer .sv-brand{font-size:14px}.sv-footer .sv-brand-mark{height:26px;width:26px;border-radius:8px;font-size:13px}.sv-footer>span,.sv-footer>a:last-child{font-size:10px;color:#77768e;text-decoration:none}
    .sv-guide-backdrop{position:fixed;inset:0;z-index:45;display:grid;place-items:center;padding:16px;background:rgba(4,5,16,.78);backdrop-filter:blur(7px)}.sv-guide-modal{width:min(100%,430px);position:relative;padding:27px;border:1px solid rgba(0,243,255,.24);border-radius:16px;background:#121329;box-shadow:0 0 55px rgba(0,243,255,.08)}.sv-guide-modal h2{margin:12px 0 17px;font-size:26px;letter-spacing:-1px}.sv-guide-modal h2 span{color:#ff2c93}.sv-guide-close{position:absolute;right:13px;top:12px;width:29px;height:29px;border:1px solid rgba(255,255,255,.1);border-radius:50%;background:#1c1d35;color:#aaa9ba;font-size:21px;cursor:pointer}.sv-guide-modal ol{display:grid;gap:9px;padding:0;margin:0 0 19px;list-style:none}.sv-guide-modal li{display:flex;align-items:center;gap:13px;padding:12px;border:1px solid rgba(255,255,255,.07);border-radius:9px;background:rgba(255,255,255,.02)}.sv-guide-modal li>b{color:#00e5ed;font-size:11px}.sv-guide-modal li strong,.sv-guide-modal li small{display:block}.sv-guide-modal li strong{font-size:11px}.sv-guide-modal li small{margin-top:4px;color:#8f8ea3;font-size:9px}
    @media(max-width:760px){.sv-page{padding:0 17px}.sv-nav{height:68px}.sv-nav-links{display:none}.sv-nav-actions{gap:11px}.sv-user-label,.sv-admin-link{display:none}.sv-brand{font-size:17px}.sv-brand-mark{width:30px;height:30px}.sv-login-btn{font-size:12px}.sv-button-small{padding:10px 11px;font-size:10px}
      .sv-hero{grid-template-columns:1fr;min-height:auto;padding:68px 0 50px}.sv-hero-copy{padding:0}.sv-hero h1{font-size:58px;letter-spacing:-3.8px;margin:21px 0 15px}.sv-hero-subtitle{font-size:13px;max-width:440px}.sv-hero-actions{margin-top:22px}.sv-trust-row{margin-top:24px}.sv-hero-art{height:340px;margin-top:5px;transform:scale(.86)}.sv-slot-machine{width:226px;height:267px}.sv-slot-window{height:122px}.sv-floating-chip.sv-chip-pink{left:2%;top:49px}.sv-chip-cyan{right:-2%;bottom:42px}.sv-orbit-one{width:380px;height:225px}.sv-orbit-two{width:310px;height:290px}.sv-scroll-note{display:none}
      .sv-referral-banner{font-size:9px;padding:10px 7px}.sv-referral-banner span{display:block;margin:4px 0 0}.sv-features{grid-template-columns:1fr;gap:9px}.sv-feature-card{min-height:75px;padding:14px}.sv-games-section{margin:55px auto 58px}.sv-section-heading h2{font-size:27px}.sv-game-grid{grid-template-columns:1fr;gap:7px}.sv-game-item{min-height:61px;padding:8px}.sv-game-thumb{width:38px;height:38px}.sv-game-title{font-size:10px}.sv-play-button{font-size:8px}.sv-bottom-cta{min-height:185px;align-items:flex-start;justify-content:center;flex-direction:column;gap:18px;padding:23px}.sv-bottom-cta h2{font-size:20px}.sv-footer{gap:8px;flex-wrap:wrap;padding:16px 0}.sv-footer>span{order:3;width:100%}}
    @media(min-width:761px) and (max-width:1000px){.sv-page{padding:0 28px}.sv-hero{min-height:500px}.sv-hero-art{transform:scale(.86)}.sv-hero h1{font-size:68px}.sv-nav-links{gap:18px}}
  `]
})
export class HomeComponent implements OnInit, OnDestroy {
  games = FEATURED_GAMES;
  gameError = '';
  chatOpen = false;
  guideOpen = false;
  identity = this.spinVault.currentIdentity;
  private identitySubscription: Subscription | null = null;

  constructor(private readonly spinVault: SpinVaultService) {}

  ngOnInit(): void {
    this.identitySubscription = this.spinVault.identity$.subscribe((identity) => (this.identity = identity));
    if (!this.spinVault.isConfigured) {
      this.gameError = 'Connect Supabase by setting supabaseUrl and supabaseAnonKey in the environment files.';
    }
    void this.spinVault.initialize().catch((error: unknown) => {
      if (this.spinVault.isConfigured) this.gameError = this.message(error);
    });
    void this.loadGames();
  }

  async loadGames(): Promise<void> {
    if (!this.spinVault.isConfigured) {
      this.games = FEATURED_GAMES;
      return;
    }
    try {
      const games = await this.spinVault.loadGames();
      this.games = games.length ? games : FEATURED_GAMES;
      this.gameError = '';
    } catch (error) {
      this.gameError = this.message(error);
    }
  }

  openChat(): void {
    this.chatOpen = true;
  }

  scrollToGames(): void {
    document.getElementById('games')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onGameIconError(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement) image.hidden = true;
  }

  async signOut(): Promise<void> {
    try {
      await this.spinVault.signOut();
    } catch (error) {
      this.gameError = this.message(error);
    }
  }

  private message(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to connect to SpinVault right now.';
  }

  ngOnDestroy(): void {
    this.identitySubscription?.unsubscribe();
  }
}
