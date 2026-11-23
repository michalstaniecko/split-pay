# Offline: outbox + delta sync, edycja offline tylko własnych wydatków

Aplikacja działa offline dzięki lokalnemu SQLite (cache plus kolejka operacji, czyli outbox) i synchronizacji „wyślij outbox, pobierz zmiany od `updatedAt`”. Konflikty ograniczamy regułami, a nie algorytmem:
- dodawanie offline wolno każdemu, bo ID (UUID) powstaje na telefonie, więc dodawanie nie powoduje konfliktów;
- edycja i usuwanie offline dotyczy tylko wydatków dodanych przez siebie;
- każdy wydatek ma numer wersji, a przy konflikcie decyduje użytkownik.

## Considered Options

- **Zapis offline tylko dla założyciela**: odrzucony. Prawie nie zmniejsza konfliktów (dodawanie i tak ich nie powoduje), a blokuje osobę, która faktycznie robi zakupy bez zasięgu.
- **Gotowy silnik sync (PowerSync, ElectricSQL)**: odrzucony. To dodatkowa usługa do hostowania, a przy powyższych regułach własna implementacja jest mała.
- **Pełny offline-first z CRDT**: przerost formy.
