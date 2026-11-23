# Local mobile builds, Linux-only CI

We build the iOS and Android apps locally on a MacBook (`expo run` / `eas build --local`) and distribute them via fastlane or Xcode, not in EAS Build or GitHub Actions. The free EAS Build plan has frustrating queues, and macOS runner minutes in Actions count ×10. CI runs only typecheck, lint and tests on Linux, with path filters, Turborepo caching and cancellation of previous runs. The repo is public (AGPL), so Linux minutes are free.
