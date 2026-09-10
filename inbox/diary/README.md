# Diary inbox

Put Obsidian daily notes here (or keep them in the vault `Diary/` folder; the sync script reads both).

Only notes marked for publish are uploaded:

```yaml
publish: true
```

or a `#blog` / `#publish` tag in the body.

Category comes from the title (or an explicit `category` field):

| In the title | Category |
| --- | --- |
| `[reading]` / `阅读` | reading |
| `[making]` / `制作` | making |
| `[research]` / `研究` | research |
| `[notes]` / `笔记` or none | notes |

Example title: `[reading] finished the first chapter`
