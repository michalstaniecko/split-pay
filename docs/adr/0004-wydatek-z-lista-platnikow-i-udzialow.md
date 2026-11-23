# Wydatek ma listę płatników i listę udziałów

Od pierwszego dnia wydatek w modelu danych ma listę płatników z kwotami (a nie jedno pole `paidBy`) oraz listę udziałów. Wpływ to ten sam model z odwróconym kierunkiem. UI domyślnie pokazuje jednego płatnika, a wielu płatników jest pod opcją zaawansowaną. Zmiana modelu danych po starcie jest droga, a uproszczenie UI jest tanie.
