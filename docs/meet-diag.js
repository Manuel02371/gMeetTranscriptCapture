/**
 * meet-diag.js — DOM-Diagnose für MeetTranscript
 *
 * Für den Fall "Warte auf Untertitel…" / "Untertitel konnten nicht erkannt
 * werden", obwohl in Meet sichtbar Untertitel laufen. Liefert die Werte, die
 * man braucht, um SELECTORS / STRATEGIES / findCCButton() in content.js wieder
 * an das aktuelle Meet-DOM anzupassen.
 *
 * ANLEITUNG (an Betroffene weitergeben):
 *   1. Im Google-Meet-Tab: Rechtsklick -> "Untersuchen" -> Reiter "Console".
 *   2. Falls Chrome "Pasting is blocked" meldet: einmal  allow pasting  tippen
 *      + Enter.
 *   3. Diese Datei komplett einfügen und Enter drücken — WÄHREND Untertitel
 *      sichtbar sind. Der Bericht landet automatisch in der Zwischenablage.
 *   4. Danach einzeln:
 *        __mtWatch()    -> 30 s lang jemanden sprechen lassen; loggt, welche
 *                          DOM-Pfade sich beim Sprechen ändern.
 *        __mtPath("drei woerter aus einem sichtbaren untertitel")
 *                       -> Elternkette dieses Textes samt jsname / aria-live.
 *   5. Zusätzlich hilfreich: Konsole nach  [MeetTranscript]  filtern und
 *      abfotografieren.
 *
 * AUSWERTUNG:
 *   alle jsnameTreffer = 0            -> Meet hat die jsname-Werte gewechselt;
 *                                        neue Werte aus __mtPath übernehmen.
 *   tgaKEf > 0, YSxPC/r4nke/bVV8Bd = 0 -> nur die inneren Selektoren sind neu.
 *   aria-live-Region da, aber kinder <= 1 / flacher Text
 *                                     -> findAriaLiveContainer() bzw.
 *                                        looksLikeCaptionRegion() filtert sie weg.
 *   imDialog: true bei der Caption-Region -> isInDialog() verwirft sie.
 *   ccButtons leer                    -> CC-Button-Labels geändert,
 *                                        findCCButton() anpassen.
 *
 * DATENSCHUTZ: "probe" und der Suchtext von __mtPath enthalten echten
 * Besprechungsinhalt. Vor dem Weiterschicken kurz durchsehen und ggf. kürzen.
 *
 * Wird NICHT mit ausgeliefert — das Release-Zip listet die Dateien explizit auf.
 */
(() => {
  const q = s => [...document.querySelectorAll(s)];
  const js = el => el.getAttribute('jsname');
  const count = n => document.querySelectorAll(`[jsname="${n}"]`).length;

  const report = {
    version: chrome?.runtime?.getManifest?.().version ?? 'unbekannt (Seitenkontext)',
    lang: document.documentElement.lang,
    ua: navigator.userAgent,
    // Erwartete jsname-Werte der Extension (0 = Meet hat das DOM geaendert)
    jsnameTreffer: {
      'tgaKEf (Caption-Fenster)': count('tgaKEf'),
      'DS9Ooe (alt. Fenster)':    count('DS9Ooe'),
      'YSxPC (Sprecher-Block)':   count('YSxPC'),
      'r4nke (Sprechername)':     count('r4nke'),
      'bVV8Bd (Caption-Text)':    count('bVV8Bd'),
    },
    ariaLive: q('[aria-live]').map(el => ({
      live: el.getAttribute('aria-live'),
      tag: el.tagName,
      jsname: js(el),
      label: el.getAttribute('aria-label'),
      kinder: el.children.length,
      imDialog: !!el.closest('[role="dialog"],[role="alertdialog"]'),
      textLaenge: el.textContent.trim().length,
      probe: el.textContent.trim().slice(0, 40),
    })),
    regionen: q('[role="region"]').map(el => ({
      label: el.getAttribute('aria-label'), jsname: js(el), kinder: el.children.length,
    })),
    ccButtons: q('button,[role="button"]').map(el => ({
      label: el.getAttribute('aria-label'),
      tooltip: el.getAttribute('data-tooltip'),
      jsname: js(el),
      pressed: el.getAttribute('aria-pressed'),
    })).filter(x => /caption|untertitel|subtitle|\(c\)/i.test(`${x.label || ''} ${x.tooltip || ''}`)),
  };

  console.log('=== MeetTranscript Diagnose ===');
  console.log(JSON.stringify(report, null, 2));
  try { copy(JSON.stringify(report, null, 2)); console.log('(in die Zwischenablage kopiert)'); } catch (e) {}

  // Pfad zu einem sichtbaren Untertitel: __mtPath("ein paar woerter aus dem untertitel")
  window.__mtPath = (needle) => {
    const hit = q('*').filter(el =>
      el.children.length === 0 && el.textContent.includes(needle)).pop();
    if (!hit) return console.warn('Text nicht gefunden — exakt so tippen wie angezeigt');
    const chain = [];
    for (let el = hit; el && el !== document.body; el = el.parentElement) {
      chain.unshift({
        tag: el.tagName, jsname: js(el), class: el.className?.toString().slice(0, 40),
        live: el.getAttribute('aria-live'), label: el.getAttribute('aria-label'),
        role: el.getAttribute('role'), kinder: el.children.length,
      });
    }
    console.log(JSON.stringify(chain, null, 2));
    try { copy(JSON.stringify(chain, null, 2)); } catch (e) {}
  };

  // 30 s mitschneiden, welches Element sich beim Sprechen aendert: __mtWatch()
  window.__mtWatch = () => {
    const seen = new Set();
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        const el = m.target.nodeType === 1 ? m.target : m.target.parentElement;
        if (!el) continue;
        const path = [];
        for (let e = el; e && e !== document.body; e = e.parentElement) {
          path.unshift(`${e.tagName}${js(e) ? `[${js(e)}]` : ''}${e.getAttribute('aria-live') ? '{live}' : ''}`);
        }
        const key = path.join(' > ');
        if (!seen.has(key)) { seen.add(key); console.log('AENDERUNG:', key); }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log('Beobachte 30 s — jetzt bitte sprechen lassen …');
    setTimeout(() => { obs.disconnect(); console.log('fertig:', [...seen]); }, 30000);
  };

  // Aufbau der Untertitel-Region zeigen (Sprecher/Text-Verschachtelung):
  // __mtRegion()
  window.__mtRegion = () => {
    const sel = ['caption', 'subtitle', 'untertitel', 'sous-titre', 'sottotitoli',
      'subtítulo', 'legenda', 'ondertiteling', 'napisy', 'субтитры', '字幕', '자막']
      .map(w => `[role="region"][aria-label*="${w}" i]`).join(',');
    const region = document.querySelector(sel);
    if (!region) return console.warn('Keine Untertitel-Region gefunden');
    const dump = node => ({
      tag: node.tagName, jsname: js(node), role: node.getAttribute('role'),
      label: node.getAttribute('aria-label'), kinder: node.children.length,
      textLaenge: node.textContent.trim().length,
      kids: [...node.children].slice(0, 4).map(dump),
    });
    const out = { label: region.getAttribute('aria-label'), kinder: region.children.length,
      bloecke: [...region.children].slice(-4).map(dump) };
    console.log(JSON.stringify(out, null, 2));
    try { copy(JSON.stringify(out, null, 2)); } catch (e) {}
  };

  console.log('Weiter: __mtRegion()  __mtWatch()  __mtPath("woerter aus dem untertitel")');
})();
