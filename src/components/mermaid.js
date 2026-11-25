// Mermaid diagrams, drawn by Pele (https://pele.run): a ```mermaid block, and a diagram block of am whose text starts with a Mermaid
// header. Pele runs here in Node and returns one svg; this file shapes it like the svg of am's own diagrams, so the expand button,
// the text-size buttons, the reading floor and the theme work the same. Blocks in am syntax never come here.
import { render as renderPele, PeleError } from 'pele';
import { MERMAID_CSS } from '../assets.js';
import { diagramLabel } from '../svg/shapes.js';
import { esc } from '../svg/text.js';
import { DRAWING } from '../themes/type-scale.js';
import { ComponentError } from './error.js';

// am blocks that hand a Mermaid text over. tree is not one: its lines are free text, so any word can be a root label.
const DIAGRAM_BLOCKS = new Set(['flow', 'state', 'sequence', 'er', 'class', 'timeline', 'chart']);
// In these blocks one word on a line declares a node, a state, a class or an entity in am syntax.
const BARE_WORD_BLOCKS = new Set(['flow', 'state', 'er', 'class']);

// Headers that no am line looks like.
const DISTINCT_HEADER = /^(?:(?:sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|requirementDiagram|quadrantChart|C4(?:Context|Container|Component|Dynamic|Deployment))\s*;?|gitGraph(?:\s+(?:LR|TB|BT))?\s*:?|(?:architecture|block|packet|sankey|xychart|radar|treemap|treeView|venn|wardley|cynefin|ishikawa|swimlane|agentflow|usecase|railroad(?:-(?:ebnf|abnf|peg))?)-beta(?:\s+(?:horizontal|vertical|TB|TD|BT|LR|RL))?\s*:?|flowchart-elk(?:\s+(?:TB|TD|BT|LR|RL))?|(?:flowchart|graph)\s+(?:TB|TD|BT|LR|RL)\s*(?:;.*)?|pie(?:\s+showData)?\s+title\s.*|pie\s+showData|timeline\s+(?:LR|TD)|xychart\s+horizontal)$/;
// Headers that are one plain word.
const WORD_HEADER = /^(?:architecture|block|eventmodeling|gantt|info|ishikawa|journey|kanban|mindmap|packet|pie|requirement|sankey|timeline|treemap|xychart)$/;
// flowchart and graph without a direction.
const BARE_FLOWCHART = /^(?:flowchart|graph)\s*;?$/;
// am's arrow. A Mermaid flowchart has -->, -.-> and ==>, never a lone ->.
const AM_ARROW = /(?<![-.=<])->(?!>)/;

// The lines of a Mermaid text after its front matter, blank lines, comments and directives, each with its index in the block.
function body(text) {
  const lines = String(text).split('\n').map((raw, i) => ({ text: raw.trim(), i }));
  let at = lines.findIndex((l) => l.text);
  if (at !== -1 && lines[at].text === '---') {
    const close = lines.findIndex((l, i) => i > at && l.text === '---');
    if (close !== -1) at = close + 1;
  }
  const out = [];
  let directive = false;
  for (const line of lines.slice(Math.max(at, 0))) {
    if (directive || line.text.startsWith('%%{')) {
      directive = !line.text.includes('}%%');
      continue;
    }
    if (line.text && !line.text.startsWith('%%')) out.push(line);
  }
  return out;
}

export function startsWithMermaid(text, block) {
  const [head, ...rest] = body(text);
  if (!head) return false;
  if (DISTINCT_HEADER.test(head.text)) return true;
  if (BARE_FLOWCHART.test(head.text)) return block !== 'flow' || !rest.some((l) => AM_ARROW.test(l.text));
  return WORD_HEADER.test(head.text) && !BARE_WORD_BLOCKS.has(block);
}

const fence = (...lines) => ['```mermaid', ...lines, '```'].join('\n');
const STATE_EXAMPLE = fence('stateDiagram-v2', '  [*] --> Idle', '  Idle --> Open: connect()', '  Open --> [*]');
const FLOW_EXAMPLE = fence('flowchart LR', '  A[Client] -->|request| B{Cached?}', '  B -->|yes| C[(Cache)]');
// The example an error shows: the one for the diagram type the block starts with.
const EXAMPLES = [
  [/^stateDiagram/, STATE_EXAMPLE],
  [/^(?:flowchart|graph)/, FLOW_EXAMPLE],
  [/^sequenceDiagram/, fence('sequenceDiagram', '  Client->>Server: GET /users', '  Server-->>Client: 200 OK')],
  [/^erDiagram/, fence('erDiagram', '  USER ||--o{ ORDER : places')],
  [/^classDiagram/, fence('classDiagram', '  class User {', '    +String name', '  }', '  User ..> Store : uses')],
];

// The component that draws a block: comp as it is, or this one when the block holds a Mermaid diagram.
export function routeMermaid(comp, text) {
  if (!comp) return comp;
  if (comp.name !== 'mermaid' && !(DIAGRAM_BLOCKS.has(comp.name) && startsWithMermaid(text, comp.name))) return comp;
  const head = body(text)[0]?.text ?? '';
  return { ...mermaid, example: EXAMPLES.find(([re]) => re.test(head))?.[1] ?? FLOW_EXAMPLE };
}

// The first line that starts with an am change marker, or null. Mermaid writes "+ name" itself inside a class body, a quoted
// label and an accDescr block, and "+8: label" in a packet diagram; those lines are not markers.
function markerLine(text) {
  const lines = body(text);
  const classes = /^classDiagram/.test(lines[0]?.text ?? '');
  let quoted = false;
  let braces = false;
  for (const line of lines) {
    if (!quoted && !braces && /^[+\-~] +(?!\d+\s*:)\S/.test(line.text)) return line;
    if (!quoted) {
      if (braces) braces = !line.text.endsWith('}');
      else braces = line.text.endsWith('{') && (/^accDescr\b/.test(line.text) || (classes && /^class\s/.test(line.text)));
    }
    if ((line.text.split('"').length - 1) % 2) quoted = !quoted;
  }
  return null;
}

// A Pele error as one line of am: what is wrong and the text it is wrong in. The draft line number comes from the ComponentError.
function syntaxError(err, text) {
  if (!(err instanceof PeleError)) return new ComponentError(`mermaid: Pele could not draw this diagram: ${err.message}`);
  if (err.code === 'unsupported-diagram' && !err.line) {
    return new ComponentError('mermaid: the first line must name a Mermaid diagram type, such as flowchart LR, stateDiagram-v2 or sequenceDiagram', body(text)[0] ? body(text)[0].i + 1 : 0);
  }
  const lines = String(text).split('\n');
  // An error at the end of the text may point one line past it.
  const line = Math.min(err.line || 0, lines.length);
  const grammar = /^(?:Parse|Lexical) error on line \d+/i.test(err.message);
  const detail = (grammar ? err.message.trim().split('\n').at(-1) : err.message.replace(/\s+/g, ' ')).trim();
  // A grammar lists every token it could take; the first few and the one it got say enough.
  const brief = detail.replace(/^(Expecting (?:'[^']*', ){5}).*(got .*)$/, '$1..., $2');
  const short = brief.length > 200 ? `${brief.slice(0, 197)}...` : brief;
  const written = lines[line - 1]?.trim();
  const arrow = written && /^(?:stateDiagram|flowchart|graph)/.test(body(text)[0]?.text ?? '') && AM_ARROW.test(written.split(/[:：]/)[0])
    ? '; Mermaid writes this arrow as -->, and am syntax needs the Mermaid header removed'
    : '';
  return new ComponentError(`mermaid: syntax error${written ? ` in "${written}"` : ''}: ${short}${arrow}`, line);
}

const ATTRS = '((?:\\s+[\\w:-]+="[^"]*")*)\\s*';
const ROOT = new RegExp(`^<svg${ATTRS}>`);
const TEXT = new RegExp(`<text${ATTRS}(/?)>`, 'g');
const NESTED = new RegExp(`<svg${ATTRS}(/?)>`, 'g');
const IMAGE = new RegExp(`<image${ATTRS}(?:/>|>[\\s\\S]*?</image>)`, 'g');
const attrsOf = (source) => new Map([...source.matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
const tagOf = (name, attrs, slash = '') => `<${name}${[...attrs].map(([k, v]) => ` ${k}="${v}"`).join('')}${slash}>`;
const addStyle = (attrs, declarations) => {
  const style = attrs.get('style')?.replace(/;?\s*$/, ';') ?? '';
  attrs.set('style', `${style}${declarations.join(';')}`);
};

// base.css paints every text of a diagram (.am-diagram text) and sizes every svg in it (.am-diagram svg) for am's own drawings.
// A stylesheet rule beats an svg attribute, so each text and nested svg of Pele repeats its own values in a style attribute,
// which beats the rule. base.css stays as it is.
function keepOwnLook(svg) {
  return svg
    .replace(TEXT, (_, source, slash) => {
      const attrs = attrsOf(source);
      const style = attrs.get('style') ?? '';
      const own = [];
      if (!/(?:^|;)\s*fill\s*:/.test(style)) own.push(`fill:${attrs.get('fill') ?? 'inherit'}`);
      if (!/(?:^|;)\s*font(?:-size)?\s*:/.test(style)) {
        const size = attrs.get('font-size') ?? 'inherit';
        own.push(`font-size:${/^[\d.]+$/.test(size) ? `${size}px` : size}`);
      }
      if (own.length) addStyle(attrs, own);
      return tagOf('text', attrs, slash);
    })
    .replace(NESTED, (tag, source, slash, at) => {
      const attrs = attrsOf(source);
      // The svg at 0 is the root: the page sizes it, as it sizes am's own drawings.
      if (at === 0 || !attrs.has('width') || !attrs.has('height')) return tag;
      addStyle(attrs, ['width', 'height'].map((k) => `${k}:${attrs.get(k).replace(/^([\d.]+)$/, '$1px')}`).concat('max-width:none'));
      return tagOf('svg', attrs, slash);
    });
}

// The page loads nothing from outside itself (src/csp.js), so an image that is not a data URI is taken out and named in a warning.
function dropImages(svg, text, warn) {
  return svg.replace(IMAGE, (tag, source) => {
    const href = attrsOf(source).get('href') ?? '';
    if (href.startsWith('data:')) return tag;
    const ref = href.replace(/&amp;/g, '\u0026');
    const at = String(text).split('\n').findIndex((l) => l.includes(ref));
    warn?.({ line: at + 1, message: `image ${ref} is not drawn: a Mermaid diagram shows data: URI images only` });
    return '';
  });
}

const LABEL_KINDS = { flowchart: 'flow', state: 'state', sequence: 'sequence', er: 'er', class: 'class' };

function ariaLabel(svg, { type, mermaidType }, ui) {
  if (!LABEL_KINDS[type]) return esc(`Mermaid ${mermaidType}`);
  // The names are text of the svg already, so they are escaped; only a quote has to be, for the attribute.
  const names = [...svg.matchAll(/<text class="pele-label"[^>]*>([\s\S]*?)<\/text>/g)]
    .map((m) => m[1].replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().replace(/"/g, '\u0026quot;'))
    .filter(Boolean);
  return `${diagramLabel(ui, LABEL_KINDS[type], [])}${[...new Set(names)].slice(0, 8).join(esc(ui?.sep ?? ', '))}`;
}

// Pele's svg with the root tag am's own diagrams have (svgOpen in src/svg/shapes.js): the page scales, measures and expands by it.
function nativeSvg(result, text, { ui, dir, warn }) {
  const svg = keepOwnLook(dropImages(result.svg, text, warn));
  const root = svg.match(ROOT);
  const attrs = attrsOf(root[1]);
  const [x, y, w, h] = (attrs.get('viewBox') ?? `0 0 ${result.width} ${result.height}`).split(/[\s,]+/).map(Number);
  for (const name of ['viewBox', 'width', 'height', 'role', 'aria-label', 'aria-roledescription']) attrs.delete(name);
  const [width, height] = [Math.ceil(w), Math.ceil(h)];
  const head = new Map([['viewBox', `0 0 ${width} ${height}`], ['width', width], ['height', height],
    ['role', result.links.length ? 'group' : 'img'], ['aria-label', ariaLabel(svg, result, ui)], ...(dir === 'rtl' ? [['direction', 'rtl']] : []), ...attrs]);
  const inner = svg.slice(root[0].length, svg.lastIndexOf('</svg>'));
  return `${tagOf('svg', head)}${x || y ? `<g transform="translate(${-x},${-y})">${inner}</g>` : inner}</svg>`;
}

// The page styles of a page with a Mermaid diagram: Pele's colors and fonts from the theme (src/themes/mermaid.css).
export const mermaidStyles = (html) => (html.includes('class="am-diagram am-mermaid"') ? `${MERMAID_CSS}\n` : '');

// What am help adds to a block that also takes Mermaid.
export const mermaidHelpNote = (name) => (DIAGRAM_BLOCKS.has(name)
  ? `\n- A block whose first line is a Mermaid header (such as ${name === 'state' ? 'stateDiagram-v2' : 'flowchart LR or sequenceDiagram'}) is Mermaid: Pele draws it, without change markers or a steps link. See am help mermaid.`
  : '');

const mermaid = {
  name: 'mermaid',
  summary: 'Any Mermaid diagram, drawn by Pele',
  syntax: `\`\`\`mermaid
stateDiagram-v2                 ← the first line names the Mermaid diagram type
  [*] --> Idle
  Idle --> Open: connect()
\`\`\`
- Write standard Mermaid syntax. Every diagram type of Mermaid 12.1 is drawn: flowchart, sequenceDiagram, classDiagram, stateDiagram-v2, erDiagram, gantt, pie, mindmap, timeline, gitGraph and the others.
- A flow, state, sequence, er, class, timeline or chart block whose first line is a Mermaid header is drawn the same way. A block in am syntax is drawn by am.
- The colors and fonts follow the page theme and its light or dark mode. The direction is the one the Mermaid text sets.
- Change markers (+ - ~), the Before / After switch, a steps link and step-by-step video drawing are not available. For those, write the diagram in am syntax.
- The page loads nothing from outside: an image is drawn only when it is a data: URI.`,
  example: STATE_EXAMPLE,
  render(text, { args, uid, ui, dir, warn, link }) {
    if (link) throw new ComponentError('mermaid: steps cannot link a Mermaid diagram; write the diagram in am syntax (```flow, ```state or ```tree) to link its items', 0);
    const marked = markerLine(text);
    if (marked) {
      throw new ComponentError(`mermaid: "${marked.text}" starts with an am change marker, and a Mermaid diagram has no change view. For a change view, write the diagram in am syntax (\`\`\`flow, \`\`\`state, \`\`\`er or \`\`\`class without a Mermaid header); otherwise remove the "${marked.text[0]} "`, marked.i + 1);
    }
    if (args) warn?.({ message: `"${args}" is ignored: a Mermaid diagram sets its own direction and options in its text` });
    let result;
    try {
      result = renderPele(text, { idPrefix: uid(), fontSize: DRAWING.node, responsive: false });
    } catch (err) {
      throw syntaxError(err, text);
    }
    return `<figure class="am-diagram am-mermaid">${nativeSvg(result, text, { ui, dir, warn })}</figure>`;
  },
};

export default mermaid;
