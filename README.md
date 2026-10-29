# castlDDL

Conference deadline calendar for the lab's research directions:

1. Database systems, big data analytics and social networks
2. Cloud computing, parallel and distributed systems
3. Security and privacy for cloud and network systems
4. Parallel I/O, file and storage systems
5. High performance computing, computational biology and geoscience
6. Artificial intelligence, machine learning and NLP (added for ML systems work such as KV cache)

The site shows abstract deadlines, paper deadlines, rebuttal periods, notification dates and
conference dates as a month calendar and as a list. Deadlines are converted to the viewer's
local time, with a countdown. Starred venues, filters and the light/dark theme choice are kept
in the viewer's browser.

## Where the data comes from

The dates come from [ccfddl](https://github.com/ccfddl/ccf-deadlines) (MIT license), a
community-maintained list of CCF-ranked venues. A GitHub Action
(`.github/workflows/update.yml`) downloads ccfddl on the 1st and 15th of each month,
rebuilds `docs/data/deadlines.json` and the calendar feeds in `docs/ics/`, commits them,
and deploys `docs/` to GitHub Pages. ccfddl can lag behind or differ from a venue's call
for papers. Check the official site before you submit.

## Estimated dates

ccfddl lists only dates that a venue has announced. For many venues the next round is missing
for months (for example, KDD 2027 lists its July 2026 round, but not its February 2027 round).
The build therefore adds estimated dates: each abstract and paper deadline moved forward by one
year, when no announced deadline of the same type lies within 45 days of it and the date is
within the next 365 days. The site shows estimated dates hatched and in italics, with a "~" in
front. They are not in the countdown list or in the calendar feeds. When ccfddl adds the real
date, the next update replaces the estimate. The "Estimated dates" filter hides them.

## Add a date that ccfddl does not have yet

ccfddl can lag behind a venue's call for papers. To add or correct a date yourself:

1. On the site, click "+ Add a date" (top right), or open a venue and click
   "+ Add or correct dates for ..." (this fills in the venue and the year).
2. Fill in the GitHub issue form: the dates, the time zone and the source link. You need a
   GitHub account.
3. If you are a collaborator on this repository, the workflow checks the form, writes the
   entry to `manual.yml`, rebuilds the site and closes the issue, in about two minutes. If
   the form has an error, the workflow replies on the issue; edit the issue to fix it.
4. Issues from other people wait. A maintainer reads the issue and adds the `approved`
   label, and then the workflow applies it.

A date you enter replaces ccfddl's dates of the same type within 45 days in that edition. If
ccfddl has a different date there, the site shows yours and notes ccfddl's date next to it. To change an entry later, edit its
issue. You can also edit `manual.yml` by hand; the file header lists the fields. A venue that
is not on the site yet needs at least one direction in the form; it gets the ID `LAB/<name>`.

GitHub keeps only one waiting run of the workflow. If an issue gets no reply within about
five minutes, edit it (any small change) to run it again.

To let lab members apply their own entries, add them under Settings → Collaborators (or,
after the move to the lab organization, give them write access).

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
Feeds contain announced abstract and paper deadlines only, no estimated dates.

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
