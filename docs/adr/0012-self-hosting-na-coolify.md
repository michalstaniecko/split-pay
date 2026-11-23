# Self-hosting na Coolify (Hetzner) zamiast BaaS

Backend (API, PostgreSQL) działa na własnym VPS Hetzner (UE) zarządzanym przez Coolify, a pliki leżą w Hetzner Object Storage. Firebase/Firestore odrzuciliśmy, bo interfejs www i logikę rozliczeń i tak trzeba gdzieś hostować, a Firestore słabo pasuje do relacyjnego modelu sald. Self-hosted Supabase odrzuciliśmy, bo jest ciężki w utrzymaniu i upgrade'ach na małym VPS.

## Consequences

- Staging i production dzielą jedną instancję PostgreSQL (osobne bazy), żeby oszczędzać RAM.
- Backupy bazy trafiają do innej lokalizacji Hetzner niż VPS. Utrzymanie infrastruktury jest naszym kosztem.
