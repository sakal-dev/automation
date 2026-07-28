---
name: sakal-import
description: RETIRED — superseded by the sakalmaster plugin's /sakal-onboard-project and /sakal-onboard-app. Use those; this skill only points at them.---

# sakal-import — retired

This skill has been replaced. Importing a repo into SakalMaster now happens in
the **`sakalmaster`** plugin, through a directory you can review before anything
goes live:

```
/plugin install sakalmaster@sakal-automation

/sakal-onboard-project   the project layer (registry, journeys, epics)
/sakal-onboard-app       this codebase's stories and ACs
/sakal-verify            the gate — nothing is sent until this is green
/sakal-submit            send verified files
```

Why it changed: this skill wrote straight to SakalMaster from a chat. Once that
data is live it is expensive to correct and awkward to review, so the draft is
now files — diffable, editable, and linted before submission.

Do not use this skill. It is kept only so anyone who finds it is sent to the
right place.
