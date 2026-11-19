<!-- source: iamantoniodinuzzo/flutter_ai_toolkit @ bac1f742129af4c111381d9cdb576a3e90f1b412 -->
# Feature Implementation – Compact Guide

Short reference for adding a new feature following the project’s 4-tier clean architecture and Riverpod patterns.

---

## 1. Directory & Layering

**Feature structure**

```plaintext
lib/src/features/[feature_name]/
├── domain/
│   ├── entities/        # entities, value objects (no serialization)
│   ├── repositories/    # abstract repository interface
│   └── exceptions/      # sealed feature exception hierarchy
├── data/
│   ├── models/          # fromMap / toMap / toEntity()
│   └── repositories/    # concrete repository + its provider
├── application/         # controllers (Notifier / AsyncNotifier); a service only when needed
└── presentation/
    ├── screens/
    └── widgets/
```

- **Keep everything feature‑local** (no “god” folders).
- Name files consistently (one feature = one namespace):

```plaintext
✓ feature_name_repository.dart
✓ feature_name_model.dart
✓ feature_name_controller.dart
✓ feature_name_screen.dart
```

---

## 2. Domain Layer

**Goals**

- Express core business concepts.
- Avoid primitives where a type makes sense.
- Keep domain **immutable** and **framework‑free**.

**Checklist**

- [ ] Create feature directory structure.
- [ ] Add domain entities in `domain/entities/` with:
  - final fields
  - **no serialization** (`fromMap` / `toMap` / `fromJson` / `toJson` belong to the data model)
  - clear types for IDs (e.g. `UserId` instead of `String` when useful)
- [ ] Keep validation inside domain types (not scattered in functions).

---

## 3. Data Layer (Repository)

**Intent**: abstract data access (Firestore, REST, local DB, etc.) behind a
feature‑specific API.

**What to create**

1. **Abstract repository interface** in `domain/repositories/`. Always created.
2. **Data model** in `data/models/`: `fromMap` / `toMap` and `toEntity()`.
3. **Concrete repository implementation** in `data/repositories/`, implementing the interface.
4. **Feature‑specific exceptions** in `domain/exceptions/`, following the exception‑handling patterns.
5. **Repository provider** (Riverpod, code‑gen) returning the **interface** type.

**Rules**

- **Interface first**: the repository interface is part of the feature, not an optimization. Controllers
  depend on the interface, tests mock it, and the provider returns it.
- **No Leaky Abstractions**: Do not leak infrastructure types. Repositories must return Domain Entities or pure Dart types. **Never** return `DocumentSnapshot`, `Query`, or `FirebaseException` to the layers above.
- Handle external errors in the repository, rethrow as domain exceptions.

**Example – Model, repository + provider**

```dart
// lib/src/features/user_profile/domain/entities/user_profile.dart
class UserProfile {
  const UserProfile({required this.id, required this.name});
  final String id;
  final String name;
}

// lib/src/features/user_profile/data/models/user_profile_model.dart
class UserProfileModel {
  const UserProfileModel({required this.id, required this.name});

  factory UserProfileModel.fromMap(Map<String, dynamic> map) =>
      UserProfileModel(id: map['id'] as String, name: map['name'] as String);

  final String id;
  final String name;

  Map<String, dynamic> toMap() => {'id': id, 'name': name};

  UserProfile toEntity() => UserProfile(id: id, name: name);
}

// lib/src/features/user_profile/domain/repositories/user_profile_repository.dart
abstract interface class UserProfileRepository {
  Future<UserProfile> fetchProfile(String userId);
}

// lib/src/features/user_profile/data/repositories/user_profile_repository_impl.dart
import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:cloud_firestore/cloud_firestore.dart';

part 'user_profile_repository_impl.g.dart';

class UserProfileRepositoryImpl implements UserProfileRepository {
  UserProfileRepositoryImpl({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  @override
  Future<UserProfile> fetchProfile(String userId) async {
    try {
      final doc = await _firestore.collection('users').doc(userId).get();
      if (!doc.exists) throw const ProfileNotFoundException();
      return UserProfileModel.fromMap(doc.data()!).toEntity();
    } on FirebaseException catch (e) {
      throw UpdateProfileException(e.message);
    }
  }
}

@riverpod
UserProfileRepository userProfileRepository(Ref ref) {
  return UserProfileRepositoryImpl(
    firestore: ref.watch(firebaseFirestoreProvider),
  );
}
```

The exceptions used above (`ProfileNotFoundException`, `UpdateProfileException`) are subtypes of the
feature's `sealed` exception, which extends the project's abstract `AppException`. See the
exception‑handling patterns.

---

## 4. Application Layer (Controllers, optional Service)

**Controllers call repositories.** A controller is a `Notifier` / `AsyncNotifier` in `application/`. It reads
the repository through its provider (`ref.read(userProfileRepositoryProvider)`) and exposes mutation
methods that return `Future<void>`.

**Introduce a `Service` only when logic spans repositories**, for example updating a profile and the auth
record together, or logic shared by several controllers. One repository behind one controller needs no
service.

**Responsibilities of a service (when it exists)**

- Orchestrate multiple repositories (e.g. profile + auth).
- Centralize cross‑cutting concerns (logging, validation).
- Expose clear methods for the controllers (`updateUserProfile`, `loadProfilePage`).

A service has an abstract interface for the same reason a repository does: controllers mock it in unit
tests, and its provider returns the **interface** type.

```dart
// application/feature_name_service.dart
abstract interface class FeatureNameService {
  Future<String> sendOrder(FeatureOrder order);
  Future<String> sendStopOrder({required String scenarioId});
  Stream<FeatureOrder?> watchOrder(String orderId);
}

class FeatureNameServiceImpl implements FeatureNameService { ... }

class MockFeatureNameService extends Mock implements FeatureNameService {}
```

**Checklist**

- [ ] Controller in `application/` reads the repository (or the service, when one exists) via `ref.read()`.
- [ ] Inject the `LoggerService` through its provider (see `error-logging-contract.md`).
- [ ] Log operations with the `[feature][layer]` prefix.
- [ ] Providers return the interface type.

---

## 5. Presentation Layer

**Goals**

- Observe state and render UI.
- Send user input to the controllers in `application/` (`AsyncNotifier` for async state).

**Rules**

- **Dumb Widgets**: Extract UI into small, private widget classes.
- **AsyncValue**: Always handle all states (data, loading, error).
- **Side Effects**: Use `ref.listen` for navigation or snackbars.

---

## 6. Testing

- Use `ProviderContainer` with overrides for repositories/services.
- Test happy paths (success) and error paths (exceptions).
- Mock the abstract repository interface; every repository has one.
