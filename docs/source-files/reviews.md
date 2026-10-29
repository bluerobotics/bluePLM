# Drawing Reviews

A review asks one or more people to approve a package of drawings at exact versions. Reviewers
see the stored PDF of the pinned version, never someone's local copy.

## Requesting a review

1. Right-click a file or a selection and choose **Reviews > New review…** (or **Reviews > Add to
   review >** and the review being built, to collect files first). From version history, add one
   version to the review being built.
2. The package builder opens in the right panel. Each file is pinned to its latest checked-in
   version and shows how many files it depends on and whether its PDF exists.
3. Click **Generate PDFs** on a machine with SOLIDWORKS if a drawing has no PDF yet. Anyone with
   SOLIDWORKS can also generate it later; each version's PDF is made once and shared.
4. Pick reviewers (people or teams), the rule (**all must sign** or **first one decides**), a
   priority, a due date, a title and a message, then send.

## Changing an open review

Right-click files and use **Reviews > Add to review >** or **Reviews > Remove from review >**; the
lists show your open reviews (an admin also sees every open review holding the files).

- **Add** pins each file's latest checked-in version and adds it to the current round, so
  reviewers who had already finished owe a decision on the new files. Files can be added only
  while the review is waiting on its reviewers; a review sent back for changes takes newer
  versions through resubmit.
- **Remove** takes the files out with their decisions and markups. A review's last file cannot be
  removed: cancel the review instead. If the files removed were the only ones not yet approved,
  the review completes.

**Reviews > View reviews** opens the Reviews view.

## Reviewing

Open **Reviews** from the activity bar. The top-bar right-pane button hides and shows the comment
sidebar beside the drawing. **Awaiting me** lists what you still owe, overdue first,
then by priority, due date and age; **Requested by me**, **My teams** and **Done** follow.

For each file, decide **Approve**, **Approve with comments**, **Request changes** or **Reject**.
A comment is required for everything except Approve. Draw markups on the PDF; they are saved
with the review, the round and the file.

| Key | Action |
|-----|--------|
| A | Approve |
| Shift+A | Approve with comments |
| C | Request changes |
| R | Reject |
| J / K | Next / previous file |

**Download for SOLIDWORKS** saves the review's drawings with every part and assembly they
reference, at the versions the drawing used, in a folder that mirrors the vault. Files in the
package point at each other, so SOLIDWORKS opens the packaged parts, not your vault copies.
`manifest.json` and `manifest.csv` list the versions and anything that could not be packaged.

## Rounds

When changes are requested, the requester resubmits only the files that need them, at newer
versions. Approved files carry forward. Earlier rounds stay readable, and their markups are drawn
on the version they were made on.

## Reviews and file workflows

A workflow state marked **Review stage** (Edit State in the workflow editor) sends its files to a
review: moving a file into it puts the file in the review being built. The stage names where an
approval takes the files (**When approved, move to**; a stage with one exit uses it).

**Settings > File Workflows** (admins) decides what an approval does:

- **Mark them approved; the requester moves them** (default), or **Move them to the next stage**
  by themselves.
- For a package that comes back partly approved: **Move the package as one** once every file is
  approved (default), or **Move approved files ahead** one by one.

The review shows where its files stand. The requester or an admin can **Move approved files** (the
rest stay in review) or, once everything is approved, **Move package**. A file does not move if it
was checked in again after it was approved, is checked out, or its next stage has a gate of its
own; the review says which files stayed and why.

Turning **Use file workflows** off hides the Workflows view and every **Change State** entry, and
the server refuses state changes. Workflows and file states are kept for when it is turned back on.

## When a reviewer can no longer answer

A reviewer who leaves the organization, or loses access to the vault of a file they still owe, is
withdrawn from the round. The round settles without them and the requester is told. When nobody
is left to decide, cancel the review and request it again. Permanently deleting a file in a review
re-settles it, and cancels it when no file is left.
