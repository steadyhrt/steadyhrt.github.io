// Landing/sign-up behaviour (no cookies, no dependencies). Loaded on every page that has the sign-up box.
// - remembers utm_source/utm_campaign for the visit (sessionStorage) and tags outgoing App Store links
// - email-only sign-up to FormSubmit (JSON), then the thank-you state: free checklist link + ONE optional question
//   (price preference + GLP-1) sent as a second FormSubmit message and an Umami "price_pick" event
// - message match ("From the post: ..."), mobile sticky bar, Umami funnel events:
//   start_view, form_in_view, email_focus, submit_click (valid email only; submit_invalid = empty/invalid), signup, price_pick, checklist_click, sticky_click
(function () {
  var K = ['utm_source', 'utm_campaign'], s = {};
  try {
    var q = new URLSearchParams(location.search);
    K.forEach(function (k) { var v = q.get(k); if (v) sessionStorage.setItem(k, v.slice(0, 80)); s[k] = sessionStorage.getItem(k) || ''; });
  } catch (e) { K.forEach(function (k) { s[k] = ''; }); }
  var src = s.utm_source || 'direct', cam = s.utm_campaign || location.pathname;

  document.querySelectorAll('a[data-utm]').forEach(function (a) {
    try { var u = new URL(a.href); K.forEach(function (k) { if (s[k]) u.searchParams.set(k, s[k]); }); a.href = u; } catch (e) {}
  });

  // Umami may load after this script: queue events until it is there (max ~15 s).
  var pending = [], timer = null;
  function send(n, d) { try { window.umami.track(n, d); } catch (e) {} }
  function track(name, extra) {
    var d = { utm_source: src, utm_campaign: cam, page: location.pathname };
    for (var k in (extra || {})) d[k] = extra[k];
    if (window.umami && window.umami.track) return send(name, d);
    pending.push([name, d]);
    if (!timer) { var tries = 0; timer = setInterval(function () {
      if (window.umami && window.umami.track) { clearInterval(timer); pending.forEach(function (p) { send(p[0], p[1]); }); pending = []; }
      else if (++tries > 50) { clearInterval(timer); pending = []; }
    }, 300); }
  }

  var once = {};
  function first(name, extra) { if (!once[name]) { once[name] = 1; track(name, extra); } }

  var boxes = document.querySelectorAll('[data-wl-box]');
  var sticky = document.querySelector('[data-sticky]');
  if (boxes.length) first('start_view');

  // Message match: "From the post: <title>" when utm_campaign starts with a post number.
  var from = document.querySelector('[data-from]');
  if (from && window.STEADY_FROM) {
    var m = /^(\d{3})/.exec(cam), t = m && window.STEADY_FROM[m[1]];
    if (t) { from.textContent = 'From the post: ' + t; from.hidden = false; }
  }

  var signedUp = false, inView = false;
  function syncSticky() { if (sticky) sticky.hidden = signedUp || inView; }
  if ('IntersectionObserver' in window && boxes.length) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) first('form_in_view'); inView = es.some(function (x) { return x.isIntersecting; }); });
      syncSticky();
    }, { threshold: 0.35 });
    boxes.forEach(function (b) { io.observe(b); });
  }
  syncSticky();
  if (sticky) sticky.querySelector('button').addEventListener('click', function () {
    track('sticky_click');
    var b = boxes[0], i = b && b.querySelector('input[type=email]');
    if (b) b.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (i) setTimeout(function () { i.focus({ preventScroll: true }); }, 350);
  });

  function post(action, body) {
    return fetch(action, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body), keepalive: true })
      .then(function (r) { return r.json(); }).then(function (j) { if (!(j && (j.success === true || j.success === 'true'))) throw 0; return j; });
  }

  boxes.forEach(function (box) {
    var f = box.querySelector('form[data-wl]'), msg = box.querySelector('.wl-msg');
    if (!f) return;
    f.elements.utm_source.value = src; f.elements.utm_campaign.value = cam;
    f.elements.email.addEventListener('focus', function () { first('email_focus'); });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      if (f._honey && f._honey.value) return;
      var em = f.elements.email.value.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { track('submit_invalid'); msg.textContent = 'Please enter a valid email address.'; return; }
      track('submit_click');   // only a valid address counts as an attempt: submit_click without signup = the POST failed
      var b = f.querySelector('button[type=submit]'); b.disabled = true; msg.textContent = '';
      var slow = setTimeout(function () { msg.textContent = 'Sending… this can take up to a minute. Please keep this page open.'; }, 4000);
      post(f.action, { email: em, utm_source: src, utm_campaign: cam, page: location.pathname, _captcha: 'false', _template: 'table', _subject: 'SteadyHRT waitlist signup (' + src + ')' })
        .then(function () { clearTimeout(slow); track('signup'); signedUp = true; syncSticky(); thankYou(box, f.action, em); })
        .catch(function () { clearTimeout(slow); b.disabled = false; msg.textContent = 'Sorry, that did not go through. Please try again in a moment.'; });
    });
  });

  function thankYou(box, action, em) {
    box.innerHTML = '<h3>You’re on the list</h3><p>Thank you. We’ve also emailed you the checklist (check your spam or promotions folder if you don’t see it in a few minutes). We’ll email you once more, when the app is ready.</p>' +
      '<p><a class="btn" data-checklist href="/checklist/">Open your free doctor-visit checklist</a></p>' +
      '<p class="src"><a data-checklist href="/checklist/steadyhrt-doctor-visit-checklist.pdf">Download the PDF</a></p>' +
      '<div class="ask"><p><strong>One optional question</strong><br>If it cost one of these after the free start, which would you pick?</p>' +
      '<div class="plans"><button type="button" class="plan" data-pick="year" aria-pressed="false"><strong>$49.99/year</strong></button>' +
      '<button type="button" class="plan" data-pick="month" aria-pressed="false"><strong>$7.99/month</strong></button>' +
      '<button type="button" class="plan" data-pick="free" aria-pressed="false"><strong>I’d only use it free</strong></button></div>' +
      '<fieldset class="opt"><legend>Optional: also taking a GLP-1 (e.g. Ozempic, Wegovy, Mounjaro)?</legend>' +
      '<label><input type="radio" name="glp1" value="yes"> Yes</label> <label><input type="radio" name="glp1" value="considering"> Considering</label> <label><input type="radio" name="glp1" value="no"> No</label></fieldset>' +
      '<p><button type="button" class="btn" data-send>Send my answers</button> <small class="ask-msg" role="status"></small></p></div>';
    var plan = '';
    box.querySelectorAll('[data-checklist]').forEach(function (a) { a.addEventListener('click', function () { track('checklist_click'); }); });
    box.querySelectorAll('[data-pick]').forEach(function (bt) { bt.addEventListener('click', function () {
      plan = bt.getAttribute('data-pick');
      box.querySelectorAll('[data-pick]').forEach(function (x) { x.setAttribute('aria-pressed', x === bt ? 'true' : 'false'); });
    }); });
    box.querySelector('[data-send]').addEventListener('click', function () {
      var g = box.querySelector('input[name=glp1]:checked'), glp = g ? g.value : 'not answered', am = box.querySelector('.ask-msg');
      if (!plan && !g) { am.textContent = 'Pick an option, or just close this: it is optional.'; return; }
      this.disabled = true;
      post(action, { email: em, plan_pick: plan || 'not answered', glp1: glp, utm_source: src, utm_campaign: cam, page: location.pathname, _captcha: 'false', _template: 'table', _subject: 'SteadyHRT waitlist answers (' + src + ')' })
        .then(function () { track('price_pick', { plan: plan || 'not answered', glp1: glp }); box.querySelector('.ask').innerHTML = '<p>Thank you, that helps.</p>'; })
        .catch(function () { box.querySelector('[data-send]').disabled = false; am.textContent = 'Sorry, that did not go through. Please try again.'; });
    });
  }
})();
