# Examples — flow completi id-based con sorgente Semantics

Ogni esempio mostra i widget Flutter da modificare nel sorgente accanto al flow YAML.

---

## Esempio 1 — Login

### Sorgente Flutter (modifiche necessarie)

```dart
// lib/src/features/auth/presentation/sign_in_screen.dart

// Email field
Semantics(
  identifier: 'auth_email_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Email'),
    controller: _emailController,
  ),
),

// Password field
Semantics(
  identifier: 'auth_password_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Password'),
    controller: _passwordController,
    obscureText: true,
  ),
),

// Sign In button
Semantics(
  identifier: 'auth_sign_in_button',
  child: ElevatedButton(
    onPressed: _signIn,
    child: const Text('Sign In'),
  ),
),

// Prima schermata visibile post-login (per extendedWaitUntil)
// Esempio: tab nella home nav bar
Semantics(
  identifier: 'home_profile_tab',
  child: NavigationBarDestination(
    icon: const Icon(Icons.person),
    label: 'Profile & Settings',
  ),
),

// Primo elemento visibile sulla splash/sign-in (per cold-start wait)
Semantics(
  identifier: 'auth_sign_in_title',
  child: Text('Sign in to continue'),
),
```

### Flow YAML

```yaml
appId: com.example.myapp.dev
name: "Login"
tags:
  - auth
  - screenshots
env:
  USER_EMAIL: "user@example.com"
  USER_PASSWORD: "<password>"
---
- launchApp:
    clearState: true

# Cold-start: splash nera può durare 10-30s su emulatori lenti
- extendedWaitUntil:
    visible:
      id: "auth_sign_in_title"
    timeout: 30000
- waitForAnimationToEnd
- takeScreenshot: screenshots/login/00_sign_in_screen

- tapOn:
    id: "auth_email_field"
- inputText: ${USER_EMAIL}

- tapOn:
    id: "auth_password_field"
- inputText: ${USER_PASSWORD}
- hideKeyboard
- waitForAnimationToEnd
- takeScreenshot: screenshots/login/01_credentials_filled

- tapOn:
    id: "auth_sign_in_button"

- assertVisible:
    id: "home_profile_tab"
- waitForAnimationToEnd
- takeScreenshot: screenshots/login/02_home_after_login
```

---

## Esempio 2 — Registrazione Pilot

### Sorgente Flutter (modifiche necessarie)

```dart
// lib/src/features/auth/presentation/sign_in_screen.dart

// Link "Don't have an account? Register"
Semantics(
  identifier: 'auth_register_link',
  child: TextButton(
    onPressed: _navigateToRegister,
    child: const Text("Don't have an account? Register"),
  ),
),
```

```dart
// lib/src/features/auth/presentation/register_screen.dart

// Titolo schermata registrazione (per assertVisible post-navigazione)
Semantics(
  identifier: 'register_screen_title',
  child: Text('Create your account'),
),

// Campi form
Semantics(
  identifier: 'register_full_name_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Full name'),
  ),
),
Semantics(
  identifier: 'register_email_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Email'),
  ),
),
Semantics(
  identifier: 'register_phone_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Phone Number'),
  ),
),
Semantics(
  identifier: 'register_password_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Password'),
    obscureText: true,
  ),
),
Semantics(
  identifier: 'register_confirm_password_field',
  child: TextFormField(
    decoration: const InputDecoration(labelText: 'Confirm password'),
    obscureText: true,
  ),
),

// Submit button
Semantics(
  identifier: 'register_submit_button',
  child: ElevatedButton(
    onPressed: _register,
    child: const Text('Register & Verify'),
  ),
),

// Schermata email verification
Semantics(
  identifier: 'email_verification_title',
  child: Text('Verify your email'),
),
```

### Flow YAML

```yaml
appId: com.example.myapp.dev
name: "Register - Pilot"
tags:
  - auth
  - screenshots
env:
  FULL_NAME: "Mario Rossi"
  USER_EMAIL: "mario@test.com"
  USER_PHONE: "3331234567"
  USER_PASSWORD: "password123"
---
- launchApp:
    clearState: true

- extendedWaitUntil:
    visible:
      id: "auth_sign_in_title"
    timeout: 30000
- waitForAnimationToEnd
- takeScreenshot: screenshots/register_pilot/00_sign_in_screen

- tapOn:
    id: "auth_register_link"

- assertVisible:
    id: "register_screen_title"
- waitForAnimationToEnd
- takeScreenshot: screenshots/register_pilot/01_registration_screen_empty

- tapOn:
    id: "register_full_name_field"
- inputText: ${FULL_NAME}

- tapOn:
    id: "register_email_field"
- inputText: ${USER_EMAIL}

- tapOn:
    id: "register_phone_field"
- inputText: ${USER_PHONE}

# hideKeyboard prima di scorrere verso Password (potenzialmente fuori schermo)
- hideKeyboard

- tapOn:
    id: "register_password_field"
- inputText: ${USER_PASSWORD}

- tapOn:
    id: "register_confirm_password_field"
- inputText: ${USER_PASSWORD}
- hideKeyboard
- waitForAnimationToEnd
- takeScreenshot: screenshots/register_pilot/02_form_filled

- tapOn:
    id: "register_submit_button"

- assertVisible:
    id: "email_verification_title"
- waitForAnimationToEnd
- takeScreenshot: screenshots/register_pilot/03_email_verification
```

---

## Pattern: nav-rail con merged semantics

Esempio di navigation rail dove il tap su un item normalmente fallisce
(InkWell merges icon + label in un unico nodo senza id).

### Sorgente Flutter (fix con explicitChildNodes)

```dart
// lib/src/features/shell/presentation/app_navigation_rail.dart

NavigationRail(
  destinations: [
    NavigationRailDestination(
      icon: Semantics(
        // explicitChildNodes sull'ancestor per mantenere figli distinti
        explicitChildNodes: true,
        child: Semantics(
          identifier: 'nav_bookings_item',
          child: const Icon(Icons.calendar_today),
        ),
      ),
      label: const Text('Bookings'),
    ),
    NavigationRailDestination(
      icon: Semantics(
        identifier: 'nav_admin_item',
        child: const Icon(Icons.admin_panel_settings),
      ),
      label: const Text('Administration'),
    ),
  ],
  // ...
),
```

### Flow YAML

```yaml
# Tap su nav item via id (prima usava point:)
- tapOn:
    id: "nav_admin_item"

- assertVisible:
    id: "admin_screen_title"
- waitForAnimationToEnd
- takeScreenshot: screenshots/admin/00_admin_screen
```
