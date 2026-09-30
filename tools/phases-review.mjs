// Собирает из content/ru/phases.json читаемый документ для ревью: node tools/phases-review.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../content/ru/', import.meta.url);
const c = JSON.parse(readFileSync(new URL('phases.json', dir), 'utf8'));
const ids = Object.keys(c.sources);
const ref = (keys) => (keys?.length ? ' ' + keys.map((k) => `[${ids.indexOf(k) + 1}]`).join('') : '');
const line = (x) => `- ${x.text} — *${x.confidence}*${ref(x.source)}`;
const block = (title, items) => (items?.length ? `**${title}**\n\n${items.map(line).join('\n')}\n` : '');

let md = `# Тексты по фазам — на ревью\n\nСгенерировано из \`content/ru/phases.json\` (${c.status}). Правь JSON, затем перезапусти \`node tools/phases-review.mjs\`.\n\n`;
md += `Уровни: *высокая* — прямо сказано в клиническом источнике или крупном исследовании; *средняя* — есть данные, но неоднородные или из небольших работ; *слабая* — вывод или житейский совет без прямого исследования.\n\n`;
md += `Что проверить в каждой фразе: есть ли источник; не звучит ли как манипуляция; не выдаёт ли слабую гипотезу за факт; подходит ли это вам двоим.\n\n`;
for (const p of Object.values(c.phases)) {
  md += `## ${p.name}\n\n${p.summary}\n\n`;
  md += block('Тело', p.body) + '\n' + block('Настроение', p.mood) + '\n' + block('Что часто помогает', p.wants) + '\n';
  md += block('Советы (карточка «Сегодня»)', p.tips) + '\n' + block('Чего избегать', p.avoid) + '\n';
}
md += `## ${c.pms.title}\n\n` + c.pms.items.map(line).join('\n') + '\n\n';
md += block('Когда предложить врача', c.pms.doctor) + '\n' + block('Срочно', [c.pms.urgent]) + '\n' + block('Как заговорить', c.pms.howto) + '\n';
md += `## Источники\n\n` + ids.map((k, i) => `${i + 1}. [${c.sources[k].title}](${c.sources[k].url}) — ${c.sources[k].kind}`).join('\n') + '\n';
md = md.replace(/\n{3,}/g, '\n\n');
writeFileSync(new URL('phases-review.md', dir), md);
console.log('content/ru/phases-review.md');
