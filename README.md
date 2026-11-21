# ResolveIt

Intelligent IT Service Management and Incident Resolution System.

## Implemented recommendation features

- Technician recommendations rank available technicians by category skill match, active workload, and experience. High priority incidents give experience more weight. Administrators can review the reasons and change the selected technician before assigning.
- Incident category suggestions use keywords from the incident title and description, with the affected service category as an additional signal. Administrators make the final classification.
- Historical resolution suggestions rank completed incidents by description overlap, category, and affected service. Technicians can copy a suggested resolution into a draft and edit it before submitting.

These recommendation scores are explainable heuristics, not trained machine learning confidence values.

## AI support assistant

The dashboard includes an IT support chatbot powered by the Pollinations text generation API. Create a free API key at [enter.pollinations.ai](https://enter.pollinations.ai), then add `POLLINATIONS_API_KEY=...` to `server/.env` (see `server/.env.example`) and restart the server. The key stays on the backend and is never sent to the browser. `POLLINATIONS_MODEL` can optionally select another chat model supported by [Pollinations](https://gen.pollinations.ai/docs); the default is `openai/gpt-4o-mini`.

The incident report form also offers AI triage: based on the draft title, description, and selected service, it suggests a likely category, impact and urgency, and safe first troubleshooting steps. Users review these suggestions and choose the impact and urgency themselves; triage never changes or submits the incident automatically.

The assistant requires a signed-in user, limits conversation history and message size, and shows a clear error if the API key is missing or the provider is unavailable. Free access and model availability are subject to Pollinations' current account and usage limits. Avoid entering passwords, verification codes, or confidential company information.

## Object-oriented design and patterns

- **Strategy pattern:** `server/assignmentStrategies.js` defines a common `select` contract and interchangeable skill, load, and priority strategies. `AssignmentStrategyFactory` constructs the configured strategy, which `server/assignmentEngine.js` uses to select a technician.
- **Factory pattern:** `IncidentFactory` in `server/domain/Incident.js` creates validated incident domain objects. The report route persists the object's immutable persistence record rather than assembling an unvalidated database row itself.
- **Encapsulation and abstraction:** the `Incident` entity stores report fields in private fields and exposes only a persistence representation; its constructor enforces domain validation.
- **Inheritance:** `DomainValidationError` extends JavaScript's `Error`, which is an appropriate "is-a" relationship.
- **Composition and relationships:** the factory creates the incident entity; persisted incidents refer to their reporter and service through IDs.
- **Exception handling and collections:** domain validation errors are handled as client errors, server/database failures use route error handling, and candidate/history collections are ranked with deterministic ordering.

The frontend also uses TypeScript interfaces to describe API and view data contracts.
