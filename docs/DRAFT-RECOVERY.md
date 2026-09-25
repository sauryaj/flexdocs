# Browser draft recovery

The new-document form now saves drafts under the authenticated account, selected document organization, document identity (`new` for this form), and a unique editor instance. Each mounted editor gets its own identifier, so separate or duplicated tabs do not overwrite one record. Returning to the form shows matching drafts and requires an explicit **Restore a copy** action. Restoration leaves the source record intact in case another tab still uses it.

Drafts retain exact Markdown and form metadata. They expire seven days after their last write; expired matching records are removed when recovery is read. Drafts live only in this browser, are not encrypted independently of browser storage, and are not a server backup. Browser data deletion or storage eviction can remove them.

The UI reports storage failures without showing a successful save timestamp. It warns on page unload while a new document remains unsaved, and intercepts ordinary link navigation when the latest browser draft is not protected. This does not yet cover every programmatic navigation or history action under storage failure. Organization selection remains usable if browser storage is blocked.

Sign Out clears these draft records and the old unscoped draft key. It changes a browser epoch so an already-open editor cannot recreate cleared drafts; other new-document tabs hide their editor when they observe the epoch change. If clearing storage fails, sign-out warns the user. Local persistence is keyed only after the profile request identifies the account. Legacy unscoped drafts are not automatically opened or attributed to a user, because their ownership is unknown; they are otherwise left untouched until explicit sign-out cleanup.

Current verification: storage unit tests cover account/org/document separation, tab independence, Markdown preservation, expiration, malformed/legacy entries, organization mismatches, quota errors, and post-logout write rejection. Browser verification created a synthetic draft, left through Cancel, returned, and restored the exact title/body through Restore a copy. The synthetic draft and recovered copy were cleared afterwards.

Still pending for the platform goal: persistent recovery for existing-document edits; comparison with newer server versions; comprehensive navigation handling; idempotent creation; full automated browser tests including account switches, logout across tabs, storage denial, offline operation, and reload. Do not treat this initial new-document implementation as completion of the whole editing milestone.
