// A stand-in for https://www.youtube.com/iframe_api in watch.e2e.js: YT.Player with its own clock, so the tests never
// touch real YouTube. Every video is 300 s long and titled "Video <id>"; ids starting "blocked" fail with error 150
// (embedding off); the playlist PLfake holds aaaaaaaaaaa, ppppppppp01, ppppppppp02 and ppppppppp03. window.ytAd(s)
// plays a fake ad: the player says it's playing but its time doesn't move for s seconds.
(() => {
  const LISTS = { PLfake: ['aaaaaaaaaaa', 'ppppppppp01', 'ppppppppp02', 'ppppppppp03'] };
  const players = new Set();
  window.ytFake = { made: 0, live: () => players.size, players };
  window.ytAd = (s) => { for (const p of players) p.adUntil = performance.now() + s * 1000; };
  class Player {
    constructor(el, o) {
      this.o = o; this.v = ''; this.t = 0; this.st = -1; this.rate = 1; this.vol = 100; this.since = 0; this.adUntil = 0; this.list = [];
      const f = document.createElement('iframe');
      f.className = 'fakeyt';
      f.width = o.width; f.height = o.height;
      el.replaceWith(f);
      this.f = f;
      window.ytFake.made++;
      players.add(this);
      this.timer = setInterval(() => this.tick(), 100);
      setTimeout(() => o.events && o.events.onReady && o.events.onReady({ target: this }), 30);
    }
    fire(n, v) { const f = this.o.events && this.o.events[n]; if (f) setTimeout(() => f({ target: this, data: v }), 10); }
    set(st) { if (this.st === st) return; this.now(); this.st = st; this.fire('onStateChange', st); }
    now() { // move the clock on to now
      const t = performance.now();
      if (this.st === 1 && t > this.adUntil) this.t += ((t - Math.max(this.since, this.adUntil)) / 1000) * this.rate;
      this.since = t;
      return this.t;
    }
    tick() { if (this.st === 1 && this.now() >= 300) { this.t = 300; this.set(0); } }
    load(v, t, play) {
      this.v = v; this.t = t || 0; this.since = performance.now(); this.st = -2;
      if (v.startsWith('blocked')) return this.fire('onError', 150);
      this.set(play ? 1 : 5);
    }
    loadVideoById(v, t) { this.load(v, t, true); }
    cueVideoById(v, t) { this.load(v, t, false); }
    cuePlaylist(o) { this.list = LISTS[o.list] || []; this.set(5); }
    getPlaylist() { return this.list.slice(); }
    playVideo() { this.set(1); }
    pauseVideo() { this.set(2); }
    seekTo(t) { this.now(); this.t = Math.min(300, Math.max(0, t)); }
    getCurrentTime() { return this.now(); }
    getDuration() { return this.v ? 300 : 0; }
    getPlayerState() { return this.st; }
    setPlaybackRate(r) { this.now(); this.rate = r; }
    getPlaybackRate() { return this.rate; }
    setVolume(v) { this.vol = v; }
    getVolume() { return this.vol; }
    getVideoData() { return { video_id: this.v, title: `Video ${this.v}` }; }
    loadModule() {}
    unloadModule() {}
    destroy() { clearInterval(this.timer); players.delete(this); this.f.remove(); }
  }
  window.YT = { Player, PlayerState: { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } };
  if (window.onYouTubeIframeAPIReady) window.onYouTubeIframeAPIReady();
})();
