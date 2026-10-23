# feeds

Data branch, not code. `WeeklyVolcanoRSS.xml` is a copy of the Smithsonian GVP / USGS Weekly
Volcanic Activity Report RSS (https://volcano.si.edu/news/WeeklyVolcanoRSS.xml), re-encoded as
UTF-8. The `Weekly report mirror` workflow on `main` refreshes it every six hours through a real
browser, because volcano.si.edu refuses every other client; the Tectonic Desk server reads it only
when the feed itself answers with an error. Nothing here is edited by hand.
