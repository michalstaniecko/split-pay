# Prywatne zdjęcia na Hetzner Object Storage, bez skanowania CSAM w MVP

Zdjęcia (tylko paragony i avatary) trafiają bezpośrednio z telefonu, przez presigned URL, do prywatnego bucketu Hetzner Object Storage. Są dostępne wyłącznie dla członków grupy przez krótkożyjące podpisane URL-e i nigdy nie trafiają do publicznego podglądu www. To zamierzona główna linia obrony przed nadużyciami: aplikacja nie nadaje się do dystrybucji treści. Uzupełniają ją limity, usuwanie EXIF, zgłaszanie, panel admina i retencja.

## Consequences

- Rezygnacja z Cloudflare R2 oznacza brak darmowego skanera CSAM Cloudflare. W MVP nie skanujemy, a wniosek o Microsoft PhotoDNA składamy przy publicznym wejściu do sklepów.
- Galerii wyjazdu i okładek grup ze zdjęć świadomie nie robimy, bo zwiększałyby ryzyko prawne.
