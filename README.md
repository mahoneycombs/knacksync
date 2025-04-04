# Project
## 1. Overview
- KnackSync is an open-source library that, when imported at runtime via Knack's client-side JavaScript, allows you to sync data between Knack views and IndexedDB, keeping data local-first in cases of offline access and quick reads/writes from custom components while maintaining record-level eventual consistency with your Knack database.
## 2. Out-of-Scope
- KnackSync is intended for small-to-medium sized applications, not extra large datasets. If you are on the Corporate plan or lower, you are unlikely to hit limitations, but YMMV.
- KnackSync is for developers who are comfortable with JavaScript, the Knack API, and concepts of local-first development.
- KnackSync is not a full-fledged offline-first solution. It is designed to be a lightweight library that provides basic synchronization capabilities with a Knack database.
- KnackSync depends on [Knack's view-based requests](https://docs.knack.com/reference/view-based-requests) and avoids authentication outside of leveraging `Knack.getUserToken()`. At such, it will not work on any pages that are not login protected.
## 3. Setup
- You can [lazy load the KnackSync library](https://docs.knack.com/reference/load-external-javascript-files) with a CDN link.
``// cdn.jsdelivr.net/gh/jdmaccombs/knack-sync@latest/dist/knack-sync.min.js``
Lazy loading implementation of the CDN link here
``
## 4. How It Works
- Upon loading, KnackSync checks for the existence of a KnackSync database in IndexedDB. If it does not exist, it creates one, leveraging app metadata (`https://api.knack.com/v1/applications/{your_app_id}`) available from the Knack API.

- Once a KnackSync database is available in IndexedDB, KnackSync will check for the existence of two object stores: "ksObjects" and "ksScenes". KnackSync will then run some optimized checks to see if ksObjects and ksScenes need to be updated based on metadata available from the Knack API.
