import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-how-to-play',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="how-page">
      <header class="how-nav">
        <a class="how-brand" routerLink="/"><span class="how-mark">S</span> Spin<span>Vault</span></a>
        <nav><a routerLink="/">Home</a><a routerLink="/" fragment="games">Games</a><a class="active" routerLink="/how-to-play">How to play</a></nav>
        <a class="how-cta" routerLink="/" fragment="home">Back to SpinVault <span>↗</span></a>
      </header>
      <section class="how-hero">
        <div class="how-kicker"><span></span> QUICK START GUIDE</div>
        <h1>Your next game night,<br /><em>made easy.</em></h1>
        <p>Four simple steps to find your game, get set up, and reach a real person whenever you need support.</p>
      </section>
      <section class="how-steps" aria-label="How to play in four steps">
        <article class="how-step"><div class="step-top"><span>01</span><span class="step-icon cyan">⌕</span></div><h2>Pick your game</h2><p>Browse our popular game list and choose the experience you’re looking for.</p></article>
        <article class="how-step"><div class="step-top"><span>02</span><span class="step-icon pink">↓</span></div><h2>Get in touch</h2><p>Message our team and we’ll share the right download link and next steps.</p></article>
        <article class="how-step"><div class="step-top"><span>03</span><span class="step-icon purple">◎</span></div><h2>Get set up</h2><p>Follow the game’s setup instructions. Our team can help if you get stuck.</p></article>
        <article class="how-step"><div class="step-top"><span>04</span><span class="step-icon green">✦</span></div><h2>Enjoy game night</h2><p>You’re ready to play. Keep support close by if you have a question.</p></article>
      </section>
      <section class="how-faq">
        <div class="faq-intro"><div class="how-kicker"><span></span> GOOD TO KNOW</div><h2>Frequently<br /><em>asked questions.</em></h2><p>Can’t find what you’re looking for? Our team is always happy to help.</p><a class="how-cta" routerLink="/" fragment="home">Chat with us <span>↗</span></a></div>
        <div class="faq-list">
          <details open><summary>How do I get started?<span>＋</span></summary><p>Choose a game from the home page and message our team. We’ll guide you through the available download and setup steps.</p></details>
          <details><summary>Where can I find game download links?<span>＋</span></summary><p>Links are added to the game cards when available. If a link isn’t listed, use “Ask us about this game” and we’ll help.</p></details>
          <details><summary>Can I request a load or cash-out?<span>＋</span></summary><p>Sign in and use the secure SpinVault chat to send a structured load or cash-out request directly to our support team.</p></details>
          <details><summary>Is SpinVault available on mobile?<span>＋</span></summary><p>Yes. SpinVault is designed mobile-first, so you can browse games and chat with support from your phone.</p></details>
          <details><summary>What if I need help during setup?<span>＋</span></summary><p>Open “Chat with us” and send us a message. A real person will help you work through your question.</p></details>
        </div>
      </section>
      <footer class="how-footer"><a class="how-brand" routerLink="/"><span class="how-mark">S</span> Spin<span>Vault</span></a><span>Play for fun. Play responsibly.</span></footer>
    </main>
  `,
  styles: [`
    :host{display:block;min-height:100vh;background:#0b0c1b;color:#f8f7ff;font-family:Inter,ui-sans-serif,system-ui,sans-serif}*{box-sizing:border-box}
    .how-page{min-height:100vh;padding:0 24px;background:radial-gradient(ellipse at 48% 5%,rgba(70,22,93,.2),transparent 40%),#0b0c1b}.how-nav,.how-footer{max-width:1100px;margin:auto;display:flex;align-items:center;justify-content:space-between}
    .how-nav{height:78px;border-bottom:1px solid rgba(255,255,255,.07)}.how-brand{display:flex;align-items:center;gap:9px;color:#fff;text-decoration:none;font-weight:850;font-size:18px}.how-brand>span:last-child{color:#ff2c93}.how-mark{width:30px;height:30px;border:1px solid #ff007f;border-radius:9px;display:grid;place-items:center;box-shadow:0 0 14px rgba(255,0,127,.23)}
    .how-nav nav{display:flex;gap:29px}.how-nav nav a{color:#a3a2b8;text-decoration:none;font-size:12px}.how-nav nav a.active{color:#fff}.how-cta{padding:11px 15px;border:1px solid rgba(0,243,255,.3);border-radius:8px;color:#00e6ed;text-decoration:none;font-size:11px;font-weight:700}
    .how-hero{max-width:1100px;margin:0 auto;text-align:center;padding:84px 0 62px}.how-kicker{display:flex;align-items:center;justify-content:center;gap:9px;color:#00dce8;font-size:9px;letter-spacing:2px;font-weight:800}.how-kicker span{height:6px;width:6px;background:#00f3ff;border-radius:50%;box-shadow:0 0 10px #00f3ff}.how-hero h1{margin:20px 0 15px;font-size:clamp(45px,7vw,68px);line-height:1.04;letter-spacing:-3px}.how-hero em,.faq-intro h2 em{font-style:normal;color:#ff2c93}.how-hero>p{max-width:520px;margin:auto;color:#a3a2b9;line-height:1.75;font-size:13px}
    .how-steps{max-width:1100px;margin:0 auto;display:grid;grid-template-columns:repeat(4,1fr);gap:13px}.how-step{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(140deg,rgba(255,255,255,.04),rgba(255,255,255,.012));padding:21px;min-height:195px}.step-top{display:flex;justify-content:space-between;align-items:center;color:#68677e;font-size:10px;font-weight:800;letter-spacing:1px}.step-icon{height:38px;width:38px;border-radius:11px;display:grid;place-items:center;font-size:20px;background:rgba(0,243,255,.08)}.step-icon.cyan{color:#00f3ff}.step-icon.pink{color:#ff2c93;background:rgba(255,0,127,.1)}.step-icon.purple{color:#a67aff;background:rgba(166,122,255,.1)}.step-icon.green{color:#44eab5;background:rgba(68,234,181,.09)}
    .how-step h2{font-size:14px;margin:19px 0 8px}.how-step p{font-size:11px;line-height:1.65;color:#9998ae;margin:0}
    .how-faq{max-width:1100px;margin:105px auto 88px;display:grid;grid-template-columns:.8fr 1.2fr;gap:70px}.faq-intro .how-kicker{justify-content:flex-start}.faq-intro h2{font-size:35px;line-height:1.13;letter-spacing:-1.4px;margin:17px 0}.faq-intro>p{font-size:12px;line-height:1.8;color:#9998ae;max-width:300px;margin-bottom:22px}.faq-list details{border-bottom:1px solid rgba(255,255,255,.1);padding:0 3px}.faq-list summary{list-style:none;cursor:pointer;padding:18px 0;display:flex;justify-content:space-between;gap:14px;font-size:12px;font-weight:650}.faq-list summary::-webkit-details-marker{display:none}.faq-list summary span{font-size:17px;color:#00e5ed;transition:transform .2s}.faq-list details[open] summary span{transform:rotate(45deg)}.faq-list details p{margin:0;padding:0 28px 17px 0;color:#9897ac;font-size:11px;line-height:1.75}
    .how-footer{min-height:75px;border-top:1px solid rgba(255,255,255,.07)}.how-footer>span{color:#77768e;font-size:10px}
    @media(max-width:700px){.how-page{padding:0 17px}.how-nav{height:68px}.how-nav nav{display:none}.how-cta{font-size:10px;padding:9px}.how-hero{padding:67px 0 44px}.how-hero h1{font-size:47px;letter-spacing:-2px}.how-steps{grid-template-columns:1fr 1fr}.how-step{min-height:178px;padding:16px}.how-step h2{font-size:13px;margin-top:15px}.how-faq{grid-template-columns:1fr;gap:28px;margin:72px auto 57px}.faq-intro h2{font-size:31px}.how-footer{flex-wrap:wrap}.how-footer>span{font-size:9px}}
    @media(max-width:390px){.how-steps{grid-template-columns:1fr}.how-step{min-height:140px}.how-step h2{margin-top:12px}}
  `]
})
export class HowToPlayComponent {}
