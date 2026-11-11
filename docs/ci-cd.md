# CI/CD ב-GitHub Actions: סיכום

הכול נמצא ב-`.github/workflows/`. הפרויקט הוא אפליקציית דסקטופ (Tauri), ולכן אין deploy לשרת.
ה-CD כאן הוא **בניית installers לכל הפלטפורמות וצירוף שלהם ל-GitHub Release**.

## סקירה

| Workflow | מתי רץ | מה עושה |
|---|---|---|
| `build-verify.yml` | push ו-PR ל-`main`, וגם ידני | בודק שהאפליקציה נבנית על 4 מערכות |
| `build-number.yml` | push ל-`main` (כלומר merge) | מעלה את מספר ה-build ואת הגרסה |
| `release.yml` | פרסום Release, וגם ידני | בונה installers לכל הפלטפורמות ומצרף ל-Release |

```
PR נפתח            ──► build-verify (4 מערכות)  ──► merge
merge ל-main       ──► build-verify + build-number (commit "chore: build N")
פרסום Release      ──► release.yml ──► 10 ריצות (5 × full/lite) ──► installers מצורפים ל-Release
```

---

## 1. `build-verify.yml`: בדיקת בנייה

**מטרה:** PR ששובר את הבנייה באחת המערכות נתפס לפני ה-merge.

**Matrix של 4 ריצות במקביל:**

| Runner | הערה |
|---|---|
| `ubuntu-24.04` | Linux x86_64 |
| `macos-latest` | |
| `windows-latest` | Windows x64 |
| `windows-latest` + `aarch64-pc-windows-msvc` | Windows ARM64, cross-compile |

`fail-fast: false`: כשל במערכת אחת לא עוצר את האחרות, כך שרואים את כל הכשלים בבת אחת.

**שלבים בכל ריצה:**

1. checkout.
2. התקנת חבילות מערכת (Linux בלבד). `webkit2gtk` ו-`javascriptcoregtk` נעולים על `2.44.0-2`, כדי שעדכון של Ubuntu לא ישבור את הבנייה.
3. התקנת Rust (`dtolnay/rust-toolchain`) עם cache של `Swatinem/rust-cache` לקיצור הקומפילציה.
4. Node 20 ו-`npm ci`, עם cache של npm.
5. הורדת הבינאריים `adb` ו-`sdb` (sidecar) דרך `scripts/download-*.sh` / `.ps1`. בלעדיהם Tauri נכשל עם "binary not found".
6. ב-Windows ARM64: העתקת בינארי x64 לשם של ARM64, כי ל-adb ול-sdb אין גרסת ARM.
7. `npm run build -- --features=vendored-openssl`. ה-OpenSSL מקומפל פנימה, בלי תלות בספרייה של המערכת.

**סודות Firebase:** `FIREBASE_OAUTH_CLIENT_ID` ו-`FIREBASE_OAUTH_CLIENT_SECRET` נכנסים כ-env ומקומפלים לאפליקציה (`option_env!`). בלעדיהם ההתחברות ל-Firebase כבויה.

**חשוב:** ה-workflow רק בונה. הוא לא מריץ בדיקות.

---

## 2. `build-number.yml`: מספר גרסה אוטומטי

**הרעיון:** הגרסה היא מספר ה-build, `1.BUILD`. כל merge ל-`main` מעלה אותה ב-1, בלי עריכה ידנית.

**מה קורה בכל merge:**

1. checkout של `main` ו-Node 20.
2. `node scripts/build-info.js --bump --force`.
3. commit ו-push של 3 קבצים: `src/build-info.json`, `package.json`, `package-lock.json`.
4. הודעת ה-commit: `chore: build 37 — v1.37.0 [skip ci]`.

**למה זה ב-CI ולא בענף של כל PR:**

- שני PR פתוחים משנים את אותה שורה ב-`build-info.json`, ולכן ה-merge השני נתקע בקונפליקט.
- העלאה בזמן PR סופרת PR-ים שנפתחו ולא כאלה שנשלחו בפועל.

**הגנות:**

| מנגנון | תפקיד |
|---|---|
| `[skip ci]` ו-`if: !contains(... '[skip ci]')` | מונעים לולאה אינסופית. בפועל גם push עם `GITHUB_TOKEN` לא מפעיל workflows מחדש |
| `concurrency: build-number`, `cancel-in-progress: false` | merges שמגיעים יחד עומדים בתור במקום להתחרות על המונה. בעבר שני merges התחרו ובאמפ אחד אבד (2026-11-09) |
| לולאת `git pull --rebase` עד 3 ניסיונות | אם merge אחר נחת באמצע הריצה, ה-push לא נכשל |
| בדיקת `git diff --quiet` | אם אין שינוי, אין commit |

**מגבלה ידועה:** GitHub שומר ריצה אחת ממתינה לכל קבוצה. אם 3 merges נחתו יחד, המונה עולה ב-2. כל גרסה עדיין ייחודית וגבוהה מקודמתה.

**הנוסחה** (`scripts/version-for.js`): קובץ ה-MSI של Windows מקבל `X.Y.Z` עם X ו-Y עד 255, ולכן המונה יושב ב-Y ומתגלגל.

```
major = 1 + floor(build / 256)
minor = build % 256
version = major.minor.0
```

| build | version | מוצג באפליקציה |
|---|---|---|
| 36 | `1.36.0` | `1.36` |
| 255 | `1.255.0` | `1.255` |
| 256 | `2.0.0` | `2.0` |
| 300 | `2.44.0` | `2.44` |

**Build מקומי:** `prebuild` ו-`prestart` מריצים את `build-info.js` בלי `--bump`. הם מרעננים commit, branch ו-timestamp, אבל המונה נשאר של ה-merge האחרון. ב-build מענף או עם שינויים לא ב-commit מוצג `1.36+ · feat/foo a1b2c3d, modified`.

---

## 3. `release.yml`: הפצה (CD)

**מופעל:** כשמפרסמים Release ב-GitHub (ההחלטה ידנית), או `workflow_dispatch`.

**10 ריצות במקביל: 5 פלטפורמות × שתי גרסאות (`full` ו-`minimal`).**

הגרסה `minimal` היא **QA Tool Lite**: שם ומזהה משלה, בלי ספרייה / Confluence / שלט / Phone (ראו "QA Tool Lite" ב-`AGENTS.md`). קבצי ההתקנה שלה נקראים `QA-Tool-Lite_<version>_<platform>`, ובריצה ידנית הם ה-artifacts `<target>-minimal-package`.

| target | runner |
|---|---|
| `windows-x64` (כולל 32-bit) | `windows-latest` |
| `windows-arm64` | `windows-latest` |
| `linux-x86_64` | `ubuntu-24.04` |
| `linux-arm64` | `ubuntu-24.04-arm` (runner ARM אמיתי) |
| `macos` | `macos-latest` |

**נקודות מיוחדות:**

- **macOS universal:** build אחד ל-Intel ול-Apple Silicon. קומפילציה נפרדת לכל ארכיטקטורה מחפשת את ה-sidecar לפי ה-triple שלה, ולכן `adb` ו-`sdb` מועתקים לשלושה שמות (`aarch64`, `x86_64`, `universal`). `sdb` של Samsung הוא Intel בלבד ורץ דרך Rosetta.
- **Windows x64:** בונה פעמיים, x64 ואחר כך i686 (32-bit). הבדיקה `if ($LASTEXITCODE)` נדרשת כי PowerShell נכשל רק לפי הפקודה האחרונה, ובלעדיה כשל ב-x64 היה עובר בשקט.
- **שמות installers:** Tauri נותן שמות לפי ארכיטקטורה בלבד (`x64`, `amd64`, `universal`). שלב "Name Installers By Platform" משנה אותם ל-`QA-Tool_<version>_<platform>`:

| platform | קבצים |
|---|---|
| `windows-x64` | `-setup.exe`, `.msi` |
| `windows-32bit` | `-setup.exe`, `.msi` |
| `windows-arm64` | `-setup.exe`, `.msi` |
| `macos-intel-and-apple-silicon` | `.dmg` |
| `linux-x86_64` | `.deb`, `.rpm`, `.AppImage` |
| `linux-arm64` | `.deb`, `.rpm` |

**פלט:**

| אירוע | מה קורה |
|---|---|
| פרסום Release | `ncipollo/release-action` מצרף את הקבצים ל-Release. נדרש `permissions: contents: write`, אחרת 403 |
| הרצה ידנית | הקבצים עולים כ-artifact (`upload-artifact`) לבדיקה בלי לפרסם |

**Tag:** ה-Release מתויג `v<גרסת package.json>`, למשל `v1.37.0`, על ה-commit הרצוי.

---

## מה לא קיים

| פער | פירוט |
|---|---|
| בדיקות אוטומטיות | אין `cargo test` ואין Karma ב-CI, כולל `acl_tests` שמגן על רישום פקודות Tauri |
| update prompt | `UpdateService` קיים אבל אף אחד לא קורא לו |
| חתימת קוד / notarization | לא מוגדרת ב-workflows (macOS ו-Windows) |
| אימות סודות | מהקבצים לא ניתן לדעת אם סודות Firebase מוגדרים בפועל ב-repo |

## קבצים קשורים

| קובץ | תפקיד |
|---|---|
| `scripts/version-for.js` | הנוסחה build → version |
| `scripts/build-info.js` | מחולל, `--bump` מעלה את המונה |
| `src/build-info.json` | מונה, גרסה, commit, branch, timestamp (נוצר ונשמר ב-git) |
| `src/app/core/build-info.ts` | `BUILD_INFO`, `APP_VERSION` |
| `scripts/download-adb.*`, `scripts/download-sdb.*` | הורדת ה-sidecar |
