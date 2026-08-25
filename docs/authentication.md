# Authentication

Start with the same account as the Roborock app. The bridge discovers the region when `region: auto` is set. If Roborock requires 2FA, it publishes `verification-code-sent` to `<topic>/auth/status`.

Request a new message with any payload on `auth/request`, then submit the e-mail code as plain text on `auth/verify`. A successful session is stored as a topic-specific `.roborock-<hash>.auth.json` file with mode `0600`.
