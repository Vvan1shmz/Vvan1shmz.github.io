# Diary inbox

Put Obsidian daily notes here (or keep them in the vault `Diary/` folder; the sync script reads both).

Only notes marked for publish **and finished** are uploaded:

```yaml
publish: true
```

or a `#blog` / `#publish` tag in the body.

Also add a line with only this character when the piece is done:

```text
完
```

Without that line, sync skips the note even if `publish` is on. The `完` line is removed before the post goes live.

Category comes from the title (or an explicit `category` field):

| In the title or `category` field | Category |
| --- | --- |
| `[reading]` / `阅读` | reading |
| `[making]` / `制作` | making |
| `[research]` / `研究` | research |
| `[talk]` / `杂谈` | talk |
| `[notes]` / `笔记` or none | notes |

New notes should start from the Diary / Blog template so the properties panel shows `title`, `date`, `category`, `publish`, and `description`.

