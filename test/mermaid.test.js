// Mermaid diagrams (src/components/mermaid.js): a mermaid block and a diagram block that starts with a Mermaid header are drawn by
// Pele into am's own figure; blocks in am syntax stay with am's components.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderDoc } from '../src/render.js';
import { COMPONENTS } from '../src/components/index.js';
import { routeMermaid, startsWithMermaid, mermaidHelpNote } from '../src/components/mermaid.js';
import { scaleSvgBoxes } from '../src/svg/shapes.js';

const draft = (...blocks) => `---\ntitle: T\nlang: en\n---\n## A\n${blocks.join('\n')}\n`;
const block = (lang, ...lines) => ['```' + lang, ...lines, '```'].join('\n');
const page = (...blocks) => renderDoc(draft(...blocks), {}, {});
// The panel's drawing only: the page also names the classes in its styles and script.
const figures = (html) => [...html.matchAll(/<figure class="am-diagram [\s\S]*?<\/figure>/g)].map((m) => m[0]);
const errorsOf = (...blocks) => {
  try {
    page(...blocks);
  } catch (err) {
    return err.errors ?? [err];
  }
  return assert.fail('the draft rendered');
};

const STATE = ['stateDiagram-v2', '  [*] --> Idle', '  Idle --> Open: connect()', '  Open --> [*]'];
const FLOW = ['flowchart LR', '  A[Client] -->|request| B{Cached?}'];
const SEQUENCE = ['sequenceDiagram', '  Client->>Server: GET /users', '  Server-->>Client: 200 OK'];

for (const [name, lines, kind, text] of [
  ['stateDiagram-v2', STATE, 'pele-state', 'connect()'],
  ['flowchart', FLOW, 'pele-flowchart', 'Cached?'],
  ['sequenceDiagram', SEQUENCE, 'pele-sequence', 'GET /users'],
]) {
  test(`mermaid: a ${name} block is drawn by Pele in am's diagram figure`, () => {
    const { html, stats } = page(block('mermaid', ...lines));
    const [figure] = figures(html);
    assert.match(figure, /^<figure class="am-diagram am-mermaid"><svg viewBox="0 0 (\d+) (\d+)" width="\1" height="\2" role="img" aria-label="[^"]+"/);
    assert.ok(figure.includes(`class="pele ${kind}"`));
    assert.ok(figure.includes(text));
    assert.doesNotMatch(figure, /<script|max-width:100%/);
    assert.equal(stats.components.mermaid, 1);
    assert.match(html, /class="am-lightbox"/, 'the expand viewer is on the page');
    assert.match(html, /--pele-bg: var\(--paper/, 'the theme mapping is in the page styles');
    const scripts = (source) => source.match(/<script\b/g).length;
    assert.equal(scripts(html), scripts(page(block('state', '[*] -> Idle')).html), 'no script beyond the ones of any am page');
  });
}

test('mermaid: the svg takes the page text size and direction like am diagrams', () => {
  const [figure] = figures(page(block('mermaid', ...STATE)).html);
  const [, width] = figure.match(/ width="(\d+)"/);
  const root = figure.match(/<svg[^>]*>/)[0];
  assert.doesNotMatch(root, /[;"](?:max-)?(?:width|height):/, 'no inline size: the page fits and scales the drawing');
  const icon = figures(page(block('mermaid', 'flowchart LR', '  A@{ icon: "fa:user" }')).html)[0].match(/<svg class="pele-icon"[^>]*>/)[0];
  assert.match(icon, /style="width:[\d.]+px;height:[\d.]+px;max-width:none"/, 'an icon keeps its own size');
  assert.match(scaleSvgBoxes(figure, 1.5), new RegExp(` width="${Math.ceil(width * 1.5)}"`));
  const rtl = renderDoc(draft(block('mermaid', ...STATE)).replace('lang: en', 'lang: he'), {}, {}).html;
  assert.match(figures(rtl)[0], / direction="rtl"/);
});

test('mermaid: every text states its own fill and size, so the rules for am drawings do not repaint it', () => {
  const [figure] = figures(page(block('mermaid', ...FLOW)).html);
  const texts = [...figure.matchAll(/<text\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(texts.length > 1);
  for (const tag of texts) assert.match(tag, /style="[^"]*fill:[^"]*font-size:/);
});

test('mermaid: a flow, state or sequence block that starts with a Mermaid header goes to Pele', () => {
  for (const [lang, lines] of [['state', STATE], ['flow', FLOW], ['sequence', SEQUENCE], ['er', ['erDiagram', '  USER ||--o{ ORDER : places']], ['class', ['classDiagram', '  A <|-- B']], ['flow', ['%% note', 'graph', '  A --> B']], ['state', ['---', 'title: x', '---', ...STATE]]]) {
    const [figure] = figures(page(block(lang, ...lines)).html);
    assert.match(figure, /class="am-diagram am-mermaid"/, `${lang}: ${lines[0]}`);
  }
});

test('mermaid: am syntax stays with am, also when a name looks like a Mermaid word', () => {
  for (const [lang, ...lines] of [['state', '[*] -> Idle'], ['state', 'pie', 'pie -> info'], ['flow', 'graph', 'graph -> chart'], ['flow', 'timeline', 'timeline -> B'], ['er', 'info', '  id int PK'], ['class', 'journey'], ['sequence', 'A -> B: x']]) {
    assert.equal(startsWithMermaid(lines.join('\n'), lang), false, `${lang}: ${lines[0]}`);
    assert.equal(routeMermaid(COMPONENTS.get(lang), lines.join('\n')), COMPONENTS.get(lang));
  }
  assert.equal(startsWithMermaid('graph\nstateDiagram-v2', 'tree'), true);
  assert.equal(routeMermaid(COMPONENTS.get('tree'), 'stateDiagram-v2'), COMPONENTS.get('tree'), 'tree lines are free text');
  const { html } = page(block('state LR', '[*] -> Idle', 'Idle -> Open: go'));
  assert.match(html, /<figure class="am-diagram am-state">/);
  assert.doesNotMatch(html, /pele/, 'a page without Mermaid carries nothing of it');
});

test('mermaid: a change marker is an error at its line that points to am syntax', () => {
  for (const lang of ['mermaid', 'state', 'flow']) {
    const [err] = errorsOf(block(lang, 'flowchart LR', '  A --> B', '  + B --> C'));
    assert.equal(err.line, 9);
    assert.match(err.message, /am change marker.*write the diagram in am syntax/);
  }
  assert.match(errorsOf(block('mermaid', 'sequenceDiagram', '- A->>B: x'))[0].message, /change marker/);
});

test('mermaid: + and - that Mermaid writes itself are not change markers', () => {
  page(block('mermaid', 'classDiagram', '  class User {', '    + save()', '    - id', '  }'));
  page(block('mermaid', 'flowchart LR', '  A["first', '- second"] --> B'));
});

test('mermaid: a parse error names the draft line and shows an example of that diagram type', () => {
  const [state] = errorsOf(block('mermaid', 'stateDiagram-v2', '  [*] --> A', '  A -->'));
  assert.equal(state.line, 9);
  assert.match(state.message, /syntax error in "A -->": Expecting/);
  assert.match(state.example, /^```mermaid\nstateDiagram-v2\n/);
  const [seq] = errorsOf(block('flow', 'sequenceDiagram', '  A->>B: x', '  broken'));
  assert.equal(seq.line, 9);
  assert.match(seq.example, /sequenceDiagram/);
  const [mixed] = errorsOf(block('state', 'stateDiagram-v2', '  [*] -> Idle'));
  assert.equal(mixed.line, 8);
  assert.match(mixed.message, /Mermaid writes this arrow as -->/);
});

test('mermaid: a block with no diagram type is an error, and one run reports every broken block', () => {
  const errors = errorsOf(block('mermaid', 'not a diagram'), block('mermaid'), block('mermaid', 'flowchart LR', '  A['));
  assert.equal(errors.length, 3);
  assert.deepEqual(errors.slice(0, 2).map((e) => e.line), [7, 9]);
  assert.match(errors[0].message, /the first line must name a Mermaid diagram type/);
});

test('mermaid: the example of am help draws', () => {
  const { example } = COMPONENTS.get('mermaid');
  assert.match(figures(page(example).html)[0], /am-mermaid/);
  assert.match(mermaidHelpNote('state'), /am help mermaid/);
  assert.equal(mermaidHelpNote('kv'), '');
});

test('mermaid: an image from outside is not drawn and is named in a warning', () => {
  const { html, stats } = page(block('mermaid', 'flowchart LR', '  A@{ img: "https://example.com/a.png", label: "x" } --> B'));
  assert.doesNotMatch(figures(html)[0], /<image/);
  assert.equal(stats.componentWarnings.length, 1);
  assert.equal(stats.componentWarnings[0].line, 8);
});

test('mermaid: steps cannot link a Mermaid diagram', () => {
  const steps = block('steps', 'Idle: waits');
  assert.match(errorsOf(block('state', ...STATE), steps)[0].message, /steps cannot link a Mermaid diagram/);
  assert.match(errorsOf(block('mermaid', ...STATE), steps)[0].message, /a mermaid diagram is not linked yet/);
});
