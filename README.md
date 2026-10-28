# castlDDL

Conference deadline calendar for the lab's research directions:

1. Database systems, big data analytics and social networks
2. Cloud computing, parallel and distributed systems
3. Security and privacy for cloud and network systems
4. Parallel I/O, file and storage systems
5. High performance computing, computational biology and geoscience

The site shows abstract deadlines, paper deadlines, rebuttal periods, notification dates and
conference dates as a month calendar and as a list. Deadlines are converted to the viewer's
local time, with a countdown. Starred venues and filters are kept in the viewer's browser.

## Where the data comes from

The dates come from [ccfddl](https://github.com/ccfddl/ccf-deadlines) (MIT license), a
community-maintained list of CCF-ranked venues. A GitHub Action
(`.github/workflows/update.yml`) downloads ccfddl on the 1st and 15th of each month,
rebuilds `docs/data/deadlines.json` and the calendar feeds in `docs/ics/`, commits them,
and deploys `docs/` to GitHub Pages. ccfddl can lag behind or differ from a venue's call
for papers. Check the official site before you submit.

## Change the venue list

- `config.yml` maps each direction to ccfddl categories (`subs`) and single venues
  (`venues`, written as `<category>/<file name>`, for example `DS/fast`). Browse the
  categories at <https://github.com/ccfddl/ccf-deadlines/tree/main/conference>.
- `extra.yml` holds venues that ccfddl does not list. The file shows the format.

Every push to `main` rebuilds and redeploys the site. To rebuild without a change, open
the Actions tab, select "Update deadlines and deploy", and click "Run workflow".

## Subscribe in a calendar app

The sidebar on the site lists one feed for all directions and one per direction. Add a
feed URL to Google Calendar (Other calendars → From URL), Outlook or Apple Calendar.
Feeds contain abstract and paper deadlines only.

## Build locally

```sh
pip install pyyaml
python scripts/build.py          # writes docs/data and docs/ics
python -m http.server -d docs    # open http://localhost:8000
```

## Set up a new copy of the repository

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
2. Settings → Actions → General → Workflow permissions: **Read and write permissions**.
3. Set `repo:` in `config.yml` to the new repository URL.
4. Actions tab → "Update deadlines and deploy" → Run workflow.
