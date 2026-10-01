/**
 * Regression tests for the 2026-10-01 incident.
 *
 * A colleague on a German Meet sat in "Warte auf Untertitel…" for a whole
 * meeting while captions were visibly running on screen. The console dump from
 * that tab:
 *
 *   jsname tgaKEf / DS9Ooe / YSxPC / r4nke / bVV8Bd  -> 0 occurrences each
 *   role="region" aria-label="Untertitel"            -> 42 children
 *   the only aria-live element                       -> flat announcement text
 *
 * The fixtures below use invented names and sentences: this repository is
 * public and the report came from a real meeting.
 *
 * Meet had dropped every jsname the extension knew (strategies A and B), and
 * its caption area is a landmark region rather than an aria-live container
 * (C, E, F). That left strategy D — which asked only for English "caption" and
 * "subtitle" labels, so on a German UI nothing matched and capture recorded
 * nothing, with no error anywhere.
 */

const test = require('node:test');
const assert = require('node:assert');

const { el, fakeDocument, matches } = require('./fake-dom.js');
const { CAPTION_REGION_SELECTOR } = require('../utils/caption-core.js');
const { loadContentScript } = require('./load-content-script.js');

/** One caption block as Meet renders it: avatar (no text), speaker, text. */
const captionBlock = (speaker, text) => el('div', {}, [
  el('div', { class: 'avatar' }, []),
  el('div', {}, speaker),
  el('div', {}, text),
]);

/** Meet's own status announcements live here — flat text, no child elements. */
const announcement = (text) =>
  el('div', { 'aria-live': 'polite' }, text);

function germanMeetDom({ withCaptionRegion = true } = {}) {
  const nodes = [
    announcement('Alex Beispiel hat die Besprechung verlassen'),
    el('div', { role: 'region', 'aria-label': 'Benachrichtigungen und Aktionen zur Anruffunktion' }, []),
  ];

  if (withCaptionRegion) {
    nodes.push(el('div', { role: 'region', 'aria-label': 'Untertitel' }, [
      // The caption area carries its own controls — language picker, font size,
      // settings. They must not stop the speaker blocks from being found.
      el('div', {}, [el('button', { 'aria-label': 'Untertiteleinstellungen öffnen' }, 'Deutsch')]),
      captionBlock('Alex Beispiel', 'Guten Morgen, dann fangen wir mal an'),
      captionBlock('Kim Muster', 'ja, einen Moment, ich teile gleich den Bildschirm'),
    ]));
  }

  nodes.push(el('div', { role: 'region', jsname: 'vNB5le', 'aria-label': 'Buttons zur Anrufsteuerung' }, []));
  return el('body', {}, nodes);
}

test('the German captions region is detected once Meet drops its jsname values', () => {
  const { meet } = loadContentScript();
  meet.document = fakeDocument(germanMeetDom());

  const match = meet.detectStrategy();

  assert.ok(match, 'no strategy matched a visible German caption region');
  assert.strictEqual(match.strategy.name, 'role-region');
  assert.strictEqual(match.container.getAttribute('aria-label'), 'Untertitel');

  const speakers = match.strategy.extractSpeakers(match.container);
  assert.deepStrictEqual([...speakers.keys()], ['Alex Beispiel', 'Kim Muster']);
  assert.strictEqual(
    speakers.get('Kim Muster'),
    'ja, einen Moment, ich teile gleich den Bildschirm'
  );
});

test('a lone status announcement is still not mistaken for captions', () => {
  const { meet } = loadContentScript();
  meet.document = fakeDocument(germanMeetDom({ withCaptionRegion: false }));

  assert.strictEqual(meet.detectStrategy(), null);
});

test('the region selector covers the localised caption labels', () => {
  const labelled = (label) => el('div', { role: 'region', 'aria-label': label }, []);

  for (const label of ['Untertitel', 'Captions', 'Sous-titres', 'Sottotitoli',
                       'Subtítulos', 'Ondertiteling', '字幕', '자막']) {
    assert.ok(
      matches(labelled(label), CAPTION_REGION_SELECTOR),
      `caption region labelled "${label}" is not matched`
    );
  }

  assert.ok(
    !matches(labelled('Buttons zur Anrufsteuerung'), CAPTION_REGION_SELECTOR),
    'an unrelated region must not match'
  );
});
