<!-- source: local (flutter-toolkit) -->
## Credential-form autofill (AUTOFILL-01..04)

**Goal:** Password managers must recognise credential fields, and must offer to save only after a successful submit.

### Why

- Without `autofillHints` + `AutofillGroup` the OS cannot tell what a field is: no one-tap fill, no generated strong
  password on sign-up, no email suggestion above the keyboard.
- `AutofillGroup` defaults to `onDisposeAction: AutofillContextAction.commit`: it asks the manager to **save whenever
  the widget is disposed**, including after a failed sign-in (user mistypes, taps "Register" → "Save this password?").
  Safe pattern: `onDisposeAction: cancel` + explicit `TextInput.finishAutofillContext()` on the success path only.

### Hint table

| Flow | Field | `autofillHints` | `keyboardType` |
|------|-------|-----------------|----------------|
| sign-in | email / username | `[username, email]` | `emailAddress` |
| sign-in | password | `[password]` | — |
| sign-up | email | `[newUsername, email]` | `emailAddress` |
| sign-up / reset / change-password | new password | `[newPassword]` | — |
| sign-up / reset / change-password | confirm password | `[newPassword]` (so the OS fills both) | — |
| any | person name | `[name]` | `name` |
| any | organisation name being created | none (not personal data) | — |

`AutofillHints.password` on a *new* password field is wrong: the OS would fill the saved password instead of suggesting a new one.

### Before (flagged AUTOFILL-01/02/03)

```dart
Form(
  child: Column(children: [
    TextFormField(controller: email, keyboardType: TextInputType.emailAddress),
    TextFormField(controller: password, obscureText: true),
  ]),
)
// _submit: await signIn(...);   // no finishAutofillContext, default group action
```

### After

```dart
Form(
  child: AutofillGroup(
    onDisposeAction: AutofillContextAction.cancel, // never save on a failed login
    child: Column(children: [
      AppOutlineTextField(
        controller: email,
        keyboardType: TextInputType.emailAddress,
        autofillHints: const [AutofillHints.username, AutofillHints.email],
      ),
      PasswordTextField(
        controller: password,
        autofillHints: const [AutofillHints.password],
      ),
    ]),
  ),
)

Future<void> _submit() async {
  final success = await ref.read(signInControllerProvider.notifier).signIn(...);
  if (success) TextInput.finishAutofillContext(); // save only on success
}
```

### Change-password: save request before clearing

```dart
if (success && mounted) {
  TextInput.finishAutofillContext();   // first — clearing first commits empty values
  _currentPasswordController.clear();
  _newPasswordController.clear();
}
```

Include a read-only `AutofillHints.username` field (the user's email) in the group so the manager knows which saved
entry the new password replaces.

### Pitfalls

- `finishAutofillContext()` after the controllers are cleared makes the manager commit empty values (AUTOFILL-03c).
- With `cancel`, the group itself sends `finishAutofillContext(false)` on dispose. The explicit save request is
  `finishAutofillContext(true)` — a test or heuristic counting *any* call over-counts.
- Forgot-password screens need no `finishAutofillContext` (the reset completes outside the app): group + `[email]`
  hints only, never flag them for AUTOFILL-03b.
- Shared field wrappers must forward `autofillHints` (AUTOFILL-04), otherwise screens drop back to raw `TextFormField`.

### Fixtures

Must flag:

| Fixture | Shape | Expect |
|---------|-------|--------|
| `login_bad` | email + `obscureText` fields, no `AutofillGroup` | AUTOFILL-01, AUTOFILL-02 |
| `login_default_group` | `AutofillGroup(child: ...)`, no `onDisposeAction` | AUTOFILL-03a |
| `register_password_hint` | register screen, `AutofillHints.password` on both password fields | AUTOFILL-02 |
| `change_password_clear_first` | `.clear()` before `finishAutofillContext()` in the success branch | AUTOFILL-03c |
| `wrapper_no_hints` | `common/` wrapper building `TextFormField`, no `autofillHints` parameter | AUTOFILL-04 |

Must NOT flag:

| Fixture | Shape |
|---------|-------|
| `forgot_password_ok` | group(cancel) + `[email, username]` hints, no `finishAutofillContext` |
| `login_ok` | group(cancel) + hints + `if (success) TextInput.finishAutofillContext()` |
| `address_form_ok` | non-credential form (address, profile bio), no group, no hints |

```dart
// login_default_group — AUTOFILL-03a
AutofillGroup(
  child: Column(children: [emailField, passwordField]),
)

// register_password_hint — AUTOFILL-02
PasswordTextField(controller: pw, autofillHints: const [AutofillHints.password])
PasswordTextField(controller: confirm, autofillHints: const [AutofillHints.password])

// change_password_clear_first — AUTOFILL-03c
if (success && mounted) {
  _newPasswordController.clear();
  TextInput.finishAutofillContext();
}

// wrapper_no_hints — AUTOFILL-04 (lib/common/widgets/app_text_field.dart)
class AppTextField extends StatelessWidget {
  const AppTextField({super.key, required this.controller});
  final TextEditingController controller;
  @override
  Widget build(BuildContext context) => TextFormField(controller: controller);
}
```
