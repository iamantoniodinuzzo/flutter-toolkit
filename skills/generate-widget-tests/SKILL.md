---
name: generate-widget-tests
description: "Generate widget tests using the Robot Testing pattern for Flutter screens and widgets. Produces tests that identify widgets exclusively by Key (never by text), support i18n, use Robot classes to separate finders/actions/assertions, and follow GWT structure. Use proactively whenever the user asks to write, generate, add, create, or fix widget tests, screen tests, UI tests, robot tests, or integration-style widget tests for any widget, screen, or dialog in this Flutter project — even if they just say \"write tests for X\" or \"add widget coverage to Y\"."
user-invocable: true
---

# Generate Widget Tests — Robot Testing Pattern

## Runtime and resources

Use the current agent's native file, search, shell, and question tools; plain-text questions and direct sequential scans are valid fallbacks. Subagents are optional and require host permission. Bundled paths below are relative to this installed skill directory; application paths are relative to the target Flutter project. Resolve sibling skills through the installed skill registry (or sibling directories), never by assuming a `skills/` folder in the application. If a required dependency is absent, name it and report the affected step as unavailable; never invent its rules or claim complete coverage.

## Entry Point: Single Widget or Entire Folder?

Read the user's request first to determine operating mode:

| Input | Mode |
|---|---|
| A specific file (`sign_in_screen.dart`) | **Single-widget mode** → skip to Phase 0 |
| A feature folder (`features/booking/presentation/`) | **Folder mode** → start at Phase F (below) |

---

## Phase F — Folder Mode: Discovery, Strategy & Parallelization

### Step F1 — Discover all widgets in the folder

Use a permitted read-only subagent, otherwise list directly all `.dart` files recursively in `presentation/`. Exclude `.g.dart` and `*_test.dart`.

```
List all .dart files (excluding .g.dart and *_test.dart)
in <package root>/lib/src/features/<name>/presentation/. 
For each file read only the first 30 lines and report:
- Widget class name and superclass (StatelessWidget, StatefulWidget, ConsumerWidget, ConsumerStatefulWidget)
- Presence of existing `static const *Key` fields
- Approximate file line count
```

### Step F2 — Classify each widget

| Tier | Criteria | Action |
|---|---|---|
| **A — Test now** | Screen (`*_screen.dart`), Dialog with state, `ConsumerStateful*`, widget > 150 lines with Keys or user interactions | Write full Robot test |
| **B — Test now** | Non-screen `ConsumerWidget` or `StatefulWidget`, widget with form/validation, complex conditional UI | Write focused Robot test |
| **C — Skip** | Pure stateless display widget < 80 lines, no providers, no interactions, no navigation | Skip (return to user with note) |

Output a **test plan table** to the user before writing any code:

```
| File | Class | Tier | Reason |
|------|-------|------|--------|
| sign_in_screen.dart | SignInScreen | A | ConsumerStatefulWidget, full form, navigation |
| booking_calendar.dart | BookingCalendar | A | 215 lines, ConsumerWidget, state interactions |
| booking_cancel_confirm_dialog.dart | BookingCancelConfirmDialog | B | Dialog with actions |
| booking_day_list.dart | BookingDayList | C | Stateless display list, 126 lines, no interactions |
```

### Step F3 — Identify shared dependencies

Before launching agents, read all Tier A+B widget files fully and identify:
- Common mocks needed (services, controllers, repositories)
- Providers that appear in multiple widgets → add to central `mocks.dart` once
- Shared child robots (reusable widget components)

### Step F4 — Launch parallel agents

Launch **one Agent per Tier A widget**, and **group Tier B widgets** (max 2–3 per agent) to avoid overloading context. Use parallel subagents only when available and permitted; otherwise process the same groups sequentially:

```
Agent 1: sign_in_screen.dart → full Robot test
Agent 2: booking_calendar.dart → full Robot test
Agent 3: booking_cancel_confirm_dialog.dart + booking_day_list.dart → focused tests
```

Each agent receives:
1. The full path of its target widget file(s)
2. The list of already-identified mocks (to avoid duplication)
3. Instructions from this skill's phases (Phase 0 through Phase 11)

### Step F5 — After all agents complete

1. Check that no two agents declared the same mock class.
2. If duplicates found → move to `test/src/mocks.dart`, update imports.
3. Run `flutter test` to verify everything compiles.

---

## Dependencies

Complex provider scenarios require the installed `unit-test` skill. Resolve its directory from the registry or `../unit-test/`. If absent, report missing patterns without claiming those scenarios are covered.

## Pattern References

For complex scenarios, read the relevant pattern file before writing any code:

| Pattern | File |
|---|---|
| StreamProvider overrides (`AsyncData` vs `Stream.value`) | `../unit-test/patterns/stream-provider-overrides.md` |
| Notifier whose `build()` watches a StreamProvider | `../unit-test/patterns/notifier-with-stream-deps.md` |
| Computed provider that returns `AsyncValue<T>` synchronously | `../unit-test/patterns/computed-async-value-providers.md` |
| Fixture helper functions and `makeContainer` factory | `../unit-test/patterns/fixture-helpers.md` |
| StreamProvider **family** error / loading state in widget tests | `../unit-test/patterns/stream-provider-overrides.md` |

---

## Phase 0 — Gap Detection (existing test file)

If the test file already exists, **read it first** and compare against the source widget.

1. **Read the widget source** — list every interactive element, key, state change, and navigation action.
2. **Read the existing test file** — extract `group(...)` and `testWidgets(...)` names, plus the Robot class.
3. **Diff** — identify missing coverage: untested user flows, missing assertions for states (loading, error, empty), unexercised navigation.
4. **Append** — add missing `group` blocks at the end of `main()`. Add missing methods to the existing Robot. Never restructure existing tests or robots.

> If the test file does not exist, skip to Phase 1.

---

## Phase 1 — Discover Before Writing

Before producing any code, read these in order:

1. **The target widget file** — understand every Key, interactive element, conditional UI, navigation, async state.
2. **The widget's dependencies** — controllers, services, providers it consumes via `ref.watch` / `ref.read`.
3. **The package's central mocks file** — reuse existing mocks. It is usually `test/src/mocks.dart` in the package that owns the widget; find it with `grep -rl "extends Mock implements" test/`.
4. **Sibling test files** — scan for existing Robots that can be composed (child robots).

> **Rule — no duplicate mocks**: never declare `class MockFoo extends Mock implements Foo {}` if one already exists centrally or in a sibling.

> **Rule — no mockito**: all new test files use **mocktail** exclusively. Do not copy legacy mockito patterns (`.mocks.dart`, `@GenerateMocks`).

---

## Phase 2 — Ensure Keys Exist in the Widget

Before writing the Robot, verify the widget source defines `static const` Keys for every interactive and assertable element.

### Key naming convention

```dart
static const rootKey = Key('widgetName_root');
static const emailFieldKey = Key('widgetName_emailField');
static const submitButtonKey = Key('widgetName_submitButton');
static const loadingIndicatorKey = Key('widgetName_loadingIndicator');
```

Pattern: `Key('<widgetNameCamelCase>_<elementNameCamelCase>')`.

### If Keys are missing

Add them to the widget source as `static const` fields on the widget class before writing any test code. Group them at the top of the class body, right after the constructor.

```dart
class MyScreen extends ConsumerStatefulWidget {
  const MyScreen({super.key});

  // Widget keys for testing
  static const rootKey = Key('myScreen_root');
  static const titleKey = Key('myScreen_title');
  static const submitButtonKey = Key('myScreen_submitButton');

  @override
  ConsumerState<MyScreen> createState() => _MyScreenState();
}
```

### Exception: private widget classes

`static const` fields on a private class (`_MyDialog`) are **not accessible** from test files. Declare keys as **top-level constants** in the same source file:

```dart
// ❌ WRONG — _MyDialog.titleKey is inaccessible from the test file
class _MyDialog extends StatefulWidget {
  static const titleKey = Key('myDialog_title');
}

// ✅ CORRECT — top-level, importable from any test file
const myDialogTitleKey = Key('myDialog_title');
const myDialogSaveButtonKey = Key('myDialog_saveButton');
const myDialogCancelButtonKey = Key('myDialog_cancelButton');

class _MyDialog extends StatefulWidget { ... }
```

---

## Phase 3 — Robot Class Structure

A Robot encapsulates all interaction with a single widget/screen. It has four sections:

```dart
class MyScreenRobot {
  MyScreenRobot(this.tester);

  final WidgetTester tester;

  // ==================== CHILD ROBOTS ====================
  // Compose robots for nested reusable widgets
  late final childWidgetRobot = ChildWidgetRobot(tester);

  // ==================== FINDERS (Private) ====================
  // ALWAYS use Key-based finders. NEVER use find.text() or find.byTooltip().
  Finder _findRoot() => find.byKey(MyScreen.rootKey);
  Finder _findSubmitButton() => find.byKey(MyScreen.submitButtonKey);

  // ==================== ACTIONS (Public) ====================
  // Each action simulates a single user gesture.
  Future<void> tapSubmitButton() async {
    await tester.ensureVisible(_findSubmitButton());
    await tester.tap(_findSubmitButton());
    await tester.pump();
  }

  // ==================== WORKFLOWS (Public) ====================
  // Compose multiple actions into common user flows.
  Future<void> submitForm({required String email, required String password}) async {
    await enterEmail(email);
    await enterPassword(password);
    await tapSubmitButton();
  }

  // ==================== ASSERTIONS (Public) ====================
  // Each assertion checks one thing.
  void expectScreenVisible() {
    expect(_findRoot(), findsOneWidget);
  }
}
```

### Rules

1. **Finders are always private** — prefixed with `_find`. Tests never call finders directly.
2. **Finders use only Keys** — `find.byKey(WidgetClass.someKey)`. Never `find.text(...)`, `find.byTooltip(...)`, or hardcoded strings.
3. **Actions are `Future<void>`** — they `await tester.ensureVisible`, perform the gesture, then pump.
4. **Workflows combine actions** — for common multi-step flows (fill form + submit).
5. **Assertions are `void`** — synchronous, each checks one expectation.
6. **Typed widget access** — to assert widget properties (enabled, obscured), use `tester.widget<T>(finder)`:

```dart
void expectSubmitButtonEnabled(bool enabled) {
  final button = tester.widget<FilledButton>(_findSubmitButton());
  expect(button.enabled, enabled);
}

void expectPasswordObscured(bool obscured) {
  final editableText = tester.widget<EditableText>(
    find.descendant(
      of: _findPasswordField(),
      matching: find.byType(EditableText),
    ),
  );
  expect(editableText.obscureText, obscured);
}
```

### Exception: `find.byType()` is acceptable

Use `find.byType()` only for:
- Generic indicators: `CircularProgressIndicator`, `SnackBar`, `LinearProgressIndicator`
- Descendant matching within a Key-scoped parent: `find.descendant(of: keyFinder, matching: find.byType(T))`

Never use `find.byType()` as the primary finder for business widgets.

---

## Phase 4 — Child Robot Composition

When a screen contains reusable child widgets (e.g., a custom `PhoneNumberField`, a `UserTypeSelector`), create separate Robot classes for each and compose them.

```dart
class PhoneNumberFieldRobot {
  PhoneNumberFieldRobot(this.tester);
  final WidgetTester tester;

  Finder _findTextField() => find.byKey(PhoneNumberField.textFieldKey);

  Future<void> enterPhoneNumber(String number) async {
    await tester.ensureVisible(_findTextField());
    await tester.enterText(_findTextField(), number);
    await tester.pump();
  }

  void expectPhoneFieldVisible() {
    expect(_findTextField(), findsOneWidget);
  }
}

class RegistrationScreenRobot {
  RegistrationScreenRobot(this.tester);
  final WidgetTester tester;

  late final phoneRobot = PhoneNumberFieldRobot(tester);

  // ... parent robot methods ...
}
```

### When to compose

- The child widget is **reused** across multiple screens → separate Robot.
- The child widget has its **own Keys** → separate Robot.
- Otherwise, keep finders in the parent Robot.

---

## Phase 5 — Test File Structure

### File location

Mirror `lib/` under `test/src/`:

```
lib/src/features/auth/presentation/sign_in/sign_in_screen.dart
→ test/src/features/auth/presentation/sign_in/sign_in_screen_test.dart
```

### File template

```dart
@Timeout(Duration(seconds: 10))
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:mocktail/mocktail.dart';
// ... feature imports ...

import '../../../../mocks.dart';

// ==================== MOCKS ====================
class MockMyService extends Mock implements MyService {}

// ==================== ROBOT ====================
class MyScreenRobot { ... }

// ==================== TEST SETUP ====================
void main() {
  late MockMyService mockService;
  late MyScreenRobot robot;

  setUp(() {
    mockService = MockMyService();
    // Default stubs
    when(() => mockService.doWork()).thenAnswer((_) async => result);
  });

  setUpAll(() {
    registerFallbackValue(MyEntity.empty());
  });

  Widget buildWidgetUnderTest() {
    return ProviderScope(
      overrides: [
        myServiceProvider.overrideWithValue(mockService),
      ],
      child: MaterialApp(
        home: const MyScreen(),
      ),
    );
  }

  group('MyScreen', () {
    group('initialization', () {
      testWidgets(
        'given screen loads when rendered then displays all UI elements',
        (tester) async {
          // Given & When
          await tester.pumpWidget(buildWidgetUnderTest());
          robot = MyScreenRobot(tester);

          // Then
          robot.expectScreenVisible();
          robot.expectSubmitButtonVisible();
        },
      );
    });
  });
}
```

### Key conventions

- `@Timeout(Duration(seconds: 10))` — widget tests need more headroom than unit tests.
- Robot instantiation: `robot = MyScreenRobot(tester);` after `pumpWidget`.
- GWT comments: `// Given`, `// When`, `// Then` in every test.
- Test names: `'given <precondition> when <action> then <outcome>'`.

### Localization delegates for third-party widgets

If the widget (or any dialog it opens) contains components that require their own localization delegates (e.g. `flutter_quill`, `intl`-based date pickers), add them to the test's `MaterialApp`. Omitting them produces a `MissingLocalizationException` only when the component is rendered — not at initial build — which is hard to diagnose.

Specifying `localizationsDelegates` **replaces** Flutter's defaults, so always include the three `Global*` delegates:

```dart
MaterialApp(
  localizationsDelegates: const [
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
    FlutterQuillLocalizations.delegate, // add package-specific delegate(s)
  ],
  home: const MyScreen(),
)
```

---

## Phase 6 — Widget Pumping Strategies

Understanding when to use each pump method is critical. The wrong choice either misses a frame (flaky test) or hangs on an infinite animation (timeout error).

### API Summary

**`pumpWidget(widget)`** — renders the widget tree for the first time (or forces a full rebuild on subsequent calls, even for the same widget). Use this to mount the widget under test. Unlike `pump()`, subsequent `pumpWidget()` calls rebuild the entire tree from scratch, not just changed widgets.

**`pump([Duration? duration])`** — advances time by the given duration and triggers one frame. Flushes microtasks. Use when you need fine-grained control over animation frames or want to observe an intermediate state.

**`pumpAndSettle([Duration duration = const Duration(milliseconds: 100), ..., Duration timeout = const Duration(minutes: 10)])`** — repeatedly calls `pump(duration)` until no more frames are scheduled. Returns the **number of pumps performed**. Throws `FlutterError('pumpAndSettle timed out')` if the tree never settles within `timeout` — so an infinite animation does not hang the test forever, it throws. Calls `pump()` at least once even if no frames are scheduled, flushing any pending microtasks.

### Pump Decision Matrix

| Situation | Use |
|---|---|
| Initial widget render | `await tester.pumpWidget(buildWidgetUnderTest())` |
| After tap/action to process callback | `await tester.pump()` |
| Assert loading state (before async completes) | `await tester.pump()` or `await tester.pump(const Duration(milliseconds: 100))` |
| After navigation or animation completes | `await tester.pumpAndSettle()` |
| Verify intermediate state before animation ends | `await tester.pump()` → assert → `await tester.pumpAndSettle()` |
| Infinite animation in tree (`CircularProgressIndicator`) | `await tester.pump()` — **never** `pumpAndSettle()`, it will throw `FlutterError` |
| Dialog open + all animations complete | `await tester.tap(trigger); await tester.pumpAndSettle()` |
| Assert exact animation complexity | `final pumps = await tester.pumpAndSettle(); expect(pumps, 3);` |

### Usage examples

```dart
// Initial render
await tester.pumpWidget(buildWidgetUnderTest());
robot = MyScreenRobot(tester);

// Single frame after tap
await robot.tapSubmitButton(); // internally: tap + pump()

// Time-based loading state
await tester.pump(const Duration(milliseconds: 100));
robot.expectLoadingIndicatorVisible();

// Wait for navigation / animation to complete
await robot.tapNavigationLink();
await tester.pumpAndSettle();
robot.expectTargetScreenVisible();

// Assert animation regression: pumpAndSettle returns pump count
final pumps = await tester.pumpAndSettle();
expect(pumps, lessThan(10)); // catches if someone adds an extra animation
```

### Avoid `pumpAndSettle()` when:

- There is an infinite animation in the widget tree (e.g., `CircularProgressIndicator`, looping `AnimationController`). It will throw `FlutterError('pumpAndSettle timed out')` after 10 minutes by default.
- You need to assert an intermediate loading state. Use `pump()` to advance one frame, assert, then `pumpAndSettle()` to finish.
- The widget registers a GoRouter listener via `addPostFrameCallback` and the test uses a plain `MaterialApp`. `pumpAndSettle()` may trigger those callbacks and throw a `GoRouter not found` exception during settle. Use explicit `pump()` calls in that case.

---

## Phase 6b — Dialog Test Patterns

### Viewport — complex dialog content

The default test viewport (400 × 600 logical pixels) causes `RenderFlex overflowed` when a dialog contains a rich text editor, a form with an error banner, or a tall column of fields. Set a larger viewport and always reset it:

```dart
testWidgets('save fails — shows inline error', (tester) async {
  tester.view.physicalSize = const Size(800, 1600);
  tester.view.devicePixelRatio = 1.0;
  addTearDown(tester.view.reset); // REQUIRED — prevents leaking into other tests

  // ... rest of test
});
```

Apply whenever the test opens a dialog. Never needed for screen-only tests.

### Trigger — always use a button to open dialogs

`WidgetsBinding.instance.addPostFrameCallback` inside a `Builder` fires while the `Navigator` is still locked on its first route, causing a `'!_debugLocked'` assertion. Use an `ElevatedButton` as the trigger:

```dart
// ❌ WRONG — Navigator lock assertion
await tester.pumpWidget(MaterialApp(
  home: Builder(builder: (ctx) {
    WidgetsBinding.instance.addPostFrameCallback((_) => showMyDialog(ctx));
    return const SizedBox();
  }),
));

// ✅ CORRECT — dialog opened by simulated tap
await tester.pumpWidget(MaterialApp(
  home: Builder(
    builder: (ctx) => ElevatedButton(
      onPressed: () => showMyDialog(ctx),
      child: const Text('open'),
    ),
  ),
));
await tester.tap(find.byType(ElevatedButton));
await tester.pumpAndSettle();
```

---

## Phase 7 — Test Setup with GoRouter

When the widget navigates (uses `context.goNamed`, `context.pushNamed`), provide a GoRouter in the test setup.

### Inline route approach (navigation verified by rendered content)

```dart
Widget buildWidgetUnderTest() {
  return ProviderScope(
    overrides: [...],
    child: MaterialApp.router(
      routerConfig: GoRouter(
        initialLocation: '/',
        routes: [
          GoRoute(
            path: '/',
            name: 'home',
            builder: (_, __) => const MyScreen(),
          ),
          GoRoute(
            path: '/target',
            name: AppRoute.target.name,
            builder: (_, __) => const Scaffold(body: Text('Target')),
          ),
        ],
      ),
    ),
  );
}
```

### Mock GoRouter approach (navigation verified by mock calls)

```dart
Widget buildWidgetUnderTest() {
  return ProviderScope(
    overrides: [...],
    child: MaterialApp(
      home: InheritedGoRouter(
        goRouter: mockGoRouter,
        child: const MyScreen(),
      ),
    ),
  );
}

// In test:
verify(() => mockGoRouter.goNamed(AppRoute.target.name)).called(1);
```

---

## Phase 8 — Coverage Strategy

For every screen or widget, test:

| Scenario | Priority |
|---|---|
| Initialization — all elements visible in default state | Must |
| Each user action triggers correct behavior | Must |
| Form validation — empty, invalid, boundary values | Must |
| Loading state — indicator visible, fields disabled | Must |
| Error state — error message displayed | Must |
| Async completion — loading disappears, fields re-enabled | Must |
| Navigation — correct route with correct params | Must |
| State toggle — e.g. password visibility, expandable sections | Should |
| Conditional UI — elements that show/hide based on state | Should |
| Keyboard actions — `TextInputAction.done` triggers submit | Should |
| Input trimming — whitespace handled correctly | Should |

> **StreamProvider family — error state**: use `provider(arg).overrideWithValue(AsyncError(...))`, not `overrideWith` with a `StreamController`. Buffered stream errors are delivered asynchronously even with `sync: true`, requiring extra `pump()` calls and making the test fragile. `overrideWithValue` sets the `AsyncError` state before the first build — one `pump()` is enough.

---

## Phase 9 — Assertion Techniques

### Widget visibility

```dart
void expectElementVisible() => expect(_findElement(), findsOneWidget);
void expectElementNotVisible() => expect(_findElement(), findsNothing);
```

### Widget property inspection

```dart
void expectFieldEnabled(bool enabled) {
  final field = tester.widget<TextFormField>(_findField());
  expect(field.enabled, enabled);
}
```

### Form field errors (use `FormFieldState`)

```dart
void expectFieldHasError(String errorText) {
  final field = tester.state<FormFieldState<String>>(_findField());
  expect(field.errorText, errorText);
}

void expectFieldHasNoError() {
  final field = tester.state<FormFieldState<String>>(_findField());
  expect(field.errorText, isNull);
}
```

### Descendant matching (scoped to Key-based parent)

```dart
void expectPasswordObscured(bool obscured) {
  final editableText = tester.widget<EditableText>(
    find.descendant(
      of: _findPasswordField(),
      matching: find.byType(EditableText),
    ),
  );
  expect(editableText.obscureText, obscured);
}
```

### SnackBar / overlay verification (acceptable `find.byType` use)

```dart
expect(find.byType(SnackBar), findsOneWidget);
```

### Wrapper widget types — use the concrete Flutter type

When calling `tester.widget<T>()`, use the concrete Flutter widget type, not the project's custom wrapper. Wrappers delegate to a standard Flutter widget internally; the test framework finds that internal type, not the outer class.

```dart
// ❌ WRONG — AppOutlineTextField wraps TextFormField; 0 widgets found
final field = tester.widget<AppOutlineTextField>(_findTitleField());

// ✅ CORRECT — use the underlying Flutter type
final field = tester.widget<TextFormField>(_findTitleField());

// ❌ WRONG — SecondaryButton wraps TextButton; 0 widgets found
final btn = tester.widget<SecondaryButton>(_findCancelButton());

// ✅ CORRECT
final btn = tester.widget<TextButton>(_findCancelButton());
```

Read the wrapper's `build()` method to discover which Flutter widget it renders.

---

## Phase 10 — Do Not

- Do **not** use `find.text(...)` as primary finder — it breaks with i18n.
- Do **not** use `find.byTooltip(...)` — it depends on locale-sensitive strings.
- Do **not** test internal implementation details — test observable behavior.
- Do **not** use `DateTime.now()` — use `DateTime.utc(year, month, day)`.
- Do **not** use `withOpacity()` — use `withValues(alpha: x)`.
- Do **not** declare mocks that already exist in `test/src/mocks.dart`.
- Do **not** use mockito — all new tests use mocktail exclusively.
- Do **not** use `pumpAndSettle()` when an infinite animation is in the tree — it throws `FlutterError('pumpAndSettle timed out')`.
- Do **not** add comments that just restate what the code does.
- Do **not** put Robot classes in separate files — keep Robot in the same test file unless it is shared by 3+ test files.
- Do **not** use `addPostFrameCallback` to open dialogs in tests — use a button in the widget tree and `tester.tap()` instead.
- Do **not** use `tester.widget<WrapperWidget>()` — use the underlying Flutter type (e.g. `TextFormField`, `TextButton`, `FilledButton`). Read the wrapper source to find the concrete type.
- Do **not** call `pumpAndSettle()` in tests that use a plain `MaterialApp` and a GoRouter listener — use `pump()` instead.

---

## Phase 11 — Central Mocks File

Same rule as unit tests:

> Add a Mock to `mocks.dart` when used by **2+ different features**.
> Single-feature mocks stay in their own test file.

When adding a new mock, grep first:

```bash
grep -r "implements FooRepository" test/   # from the package root
```

If it appears in 2+ features → move to `mocks.dart`.

---

## Quick Reference — Finder Priority

| Priority | Finder | When |
|---|---|---|
| 1 (always) | `find.byKey(WidgetClass.someKey)` | Every interactive/assertable element |
| 2 (scoped) | `find.descendant(of: keyFinder, matching: find.byType(T))` | Accessing a child widget type within a Key-scoped parent |
| 3 (indicators) | `find.byType(T)` | Generic framework widgets: `SnackBar`, `CircularProgressIndicator` |
| Never | `find.text(...)`, `find.byTooltip(...)` | Locale-dependent, breaks with i18n |
