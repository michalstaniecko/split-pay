# Buildy mobilne lokalnie, CI tylko na Linuksie

Aplikacje iOS i Android budujemy lokalnie na MacBooku (`expo run` / `eas build --local`) i dystrybuujemy przez fastlane lub Xcode, a nie w EAS Build ani w GitHub Actions. Darmowy plan EAS Build ma uciążliwe kolejki, a minuty runnerów macOS w Actions liczą się ×10. CI uruchamia tylko typecheck, lint i testy na Linuksie, z filtrami ścieżek, cache Turborepo i anulowaniem poprzednich uruchomień. Repo jest publiczne (AGPL), więc minuty Linux są darmowe.
