# Authentication

Start with the same account as the Roborock app. The bridge discovers the region when `region: auto` is set. If Roborock requires 2FA, it publishes `verification-code-sent` to `<topic>/bridge/auth/status`.

Request a new message with any payload on `<topic>/bridge/auth/request`, then submit the e-mail code as plain text on `<topic>/bridge/auth/verify`. A successful session is stored as a topic-specific `.roborock-<hash>.auth.json` file with mode `0600`.
