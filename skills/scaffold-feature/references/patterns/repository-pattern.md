# Repository Creation Guidelines

This document outlines the standard process and best practices for creating repositories within this project, ensuring consistency, testability, and maintainability. It's designed to guide both developers and AI assistants.

## Repository Structure

Follow these steps to structure your repositories:

### 1. Repository Interface (Contract)

- **Action:** Create an `abstract interface class` for the feature's data access. **Always**, even with one implementation.
- **Location:** `lib/src/features/<feature>/domain/repositories/`.
- **Purpose:** Controllers depend on the interface, the provider returns the interface type, and tests mock the interface. The implementation can change (Firestore to REST) without touching any caller.
- **Naming:** `<Name>Repository` (e.g., `UserProfileRepository`, `OrderRepository`).
- **Methods:**
  - **Naming convention:** Methods that return a `Stream<T>` MUST use the `watch` prefix; methods that return a `Future<T>` MUST use the `fetch` prefix.
  - Use specific, strong types for parameters and return values, taken from the domain.

**⚠️ NO LEAKY ABSTRACTIONS (MANDATORY)**
A repository must never leak implementation details or infrastructure-specific types to the layers above.

- **NO** `DocumentSnapshot`, `QuerySnapshot`, or `Query` in return types.
- **NO** `FirebaseException` or `DioException` thrown outside the repository.
- **NO** JSON maps (`Map<String, dynamic>`) unless they are the final domain object (rare).

The repository is a boundary: it converts raw data (JSON, Firestore docs) into **Domain Entities** and technical errors into **Domain Exceptions**.

---

### 2. Exception Handling

- **Action:** For each repository operation that can fail (beyond standard programming errors), create a specific custom exception class.
- **Location:** `lib/src/features/<feature>/domain/exceptions/`. Exceptions shared by several features live next to the project's `AppException` in core.
- **Inheritance:** `AppException` is the project's abstract base class (in core). Declare one feature-level `sealed class` that extends `AppException`, and have every feature-specific exception extend that sealed class, so callers can `switch` over them exhaustively. Keep the sealed class and its concrete exceptions in one file (Dart only allows a `sealed` class to be extended in its own library).
- **Naming:** Use a consistent naming convention: `{Operation}{Entity}Exception` (e.g., `SavePositionException`, `FetchUserException`).
- **Constructor:**
  - Include an optional `details` parameter (`String?`) for context from the underlying error.
  - *Consider* adding optional `originalException` (`Object?`) and `stackTrace` (`StackTrace?`) parameters to your base `AppException` and custom exceptions to aid debugging.
  - Provide a specific `code` (e.g., `save-position-failed`) and a user-friendly default `message`. Use the `.hardcoded` extension from `@string_extension.dart` for default messages visible in logs/debug UI.

**Example (feature-level sealed exception + concrete exceptions):**

```dart
// Located in lib/src/features/position_bookmarks/domain/exceptions/position_bookmarks_exception.dart

import 'package:your_app/src/core/exceptions/app_exception.dart';
import 'package:your_app/src/localization/string_hardcoded.dart';

/// Base exception type for the Position Bookmarks feature.
sealed class PositionBookmarksException extends AppException {
  const PositionBookmarksException({required super.code, required super.message});
}

/// Thrown when saving a position bookmark fails.
class SavePositionException extends PositionBookmarksException {
  SavePositionException()
      : super(
          code: 'save-position-failed',
          message: 'Failed to save position bookmark'.hardcoded,
        );
}

/// Thrown when fetching position bookmarks fails.
class FetchPositionsException extends PositionBookmarksException {
  FetchPositionsException()
      : super(
          code: 'fetch-positions-failed',
          message: 'Failed to fetch position bookmarks'.hardcoded,
        );
}

/// Thrown when deleting a position bookmark fails.
class DeletePositionException extends PositionBookmarksException {
  DeletePositionException()
      : super(
          code: 'delete-position-failed',
          message: 'Failed to delete position bookmark'.hardcoded,
        );
}
```

### 3. Data Model and Real Implementation (e.g., Firestore or API Client)

- **Action:** Create a concrete class that implements the repository interface defined in step 1.
- **Purpose:** Centralize data fetching, parsing, and error handling.
- **Naming:** Name it descriptively, indicating the data source (e.g., `FirestoreSavePositionRepository`, `ApiUserProfileRepository`).
- **Location:** Place implementations in the data layer under `lib/src/features/<feature>/data/repositories/`.
- **Data model:** Serialization lives in a model class in `lib/src/features/<feature>/data/models/` (`<Name>Model`) with `fromMap` / `toMap` and `toEntity()`, plus a `fromEntity` factory when the repository writes. The domain entity has no serialization. The repository maps model to entity before returning.
- **Dependencies:** Inject required external services (e.g., `FirebaseFirestore`, `FirebaseAuth`, custom `DioClient` instances) via the constructor. Use providers (see step 4) to supply these dependencies. Reference project-specific providers like `@firebase_provider.dart` or `@dio_client.dart`.
- **Error Handling:** Wrap *all* calls to external services (Firestore, Dio, etc.) in `try-catch` blocks.
  - Catch specific platform exceptions if possible (e.g., `FirebaseException`, `DioException`).
  - In the `catch` block, `throw` the custom repository exception defined in step 2, passing relevant details.
- **Helper Methods:** Create `private` helper methods for repetitive logic (e.g., getting a specific `CollectionReference`).
- **Firestore Specifics:**
  - Use consistent collection/document path conventions. Define paths as constants if possible.
  - **Mandate:** Use `.withConverter` on `CollectionReference` or `DocumentReference` whenever the corresponding **data model** class has `fromMap`/`fromJson` and `toMap`/`toJson` methods (the domain entity never has them). This reduces boilerplate and ensures type safety. Pass the object directly to `.set()` or `.add()` when using converters.
- **API Client (Dio) Specifics:**
  - If the repository interacts with a REST API, it should depend on a dedicated client class that extends `@dio_client.dart`.
  - The client class **must** have the suffix `_client` (e.g., `NominatimClient`).
  - The client class **must** define its `BaseOptions` (baseUrl, timeouts) and relevant `CacheOptions` (e.g., using `MemCacheStore` for short-lived caches).

**Example (Firestore):**

```dart
// File: lib/src/features/position_bookmarks/data/repositories/firestore_save_position_repository.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:your_app/src/features/authentication/domain/entities/app_user.dart';
import 'package:your_app/src/features/position_bookmarks/data/models/position_bookmark_model.dart';
import 'package:your_app/src/features/position_bookmarks/domain/entities/position_bookmark.dart';
import 'package:your_app/src/features/position_bookmarks/domain/exceptions/position_bookmarks_exception.dart'; // For custom exceptions
import '../../domain/repositories/save_position_repository.dart'; // The interface

class FirestoreSavePositionRepository implements SavePositionRepository {
  FirestoreSavePositionRepository({required FirebaseFirestore firestore})
      : _firestore = firestore;

  final FirebaseFirestore _firestore;

  // Helper to get the collection reference with the converter
  CollectionReference<PositionBookmarkModel> _positionsCollection(UserId userId) {
    return _firestore
        .collection('users')
        .doc(userId)
        .collection('saved_positions')
        .withConverter<PositionBookmarkModel>(
          fromFirestore: (snapshot, _) =>
              PositionBookmarkModel.fromMap(snapshot.data()!, id: snapshot.id), // data model factory
          toFirestore: (model, _) => model.toMap(), // data model method
        );
  }

  @override
  Stream<List<PositionBookmark>> watchSavedPositions(UserId userId) {
    final collection = _positionsCollection(userId);
    // Note: Error handling within the stream itself might be needed depending on requirements
    // Firestore streams handle many errors internally, but you might wrap map/listen.
    return collection.snapshots().map((snapshot) =>
        snapshot.docs.map((doc) => doc.data().toEntity()).toList());
  }

   @override
  Future<List<PositionBookmark>> fetchSavedPositions(UserId userId) async {
     try {
       final snapshot = await _positionsCollection(userId).get();
       return snapshot.docs.map((doc) => doc.data().toEntity()).toList();
     } on FirebaseException catch (e, s) {
       throw FetchPositionsException(details: e.message, originalException: e, stackTrace: s);
     } catch (e, s) { // Catch broader errors
       throw FetchPositionsException(details: e.toString(), originalException: e, stackTrace: s);
     }
  }

  @override
  Future<void> savePosition(UserId userId, PositionBookmark bookmark) async {
    try {
      // Use set directly with the data model when using withConverter
      await _positionsCollection(userId)
          .doc(bookmark.id)
          .set(PositionBookmarkModel.fromEntity(bookmark), SetOptions(merge: true));
    } on FirebaseException catch (e, s) {
      throw SavePositionException(details: e.message, originalException: e, stackTrace: s);
    } catch (e, s) {
      throw SavePositionException(details: e.toString(), originalException: e, stackTrace: s);
    }
  }

  @override
  Future<void> deletePosition(UserId userId, String bookmarkId) async {
    try {
       await _positionsCollection(userId).doc(bookmarkId).delete();
    } on FirebaseException catch (e, s) {
       throw DeletePositionException(details: e.message, originalException: e, stackTrace: s); // Assuming DeletePositionException exists
    } catch (e, s) {
       throw DeletePositionException(details: e.toString(), originalException: e, stackTrace: s);
    }
  }
}
```

**Example (Dio Client):**

```dart
// File: lib/src/features/address_search/data/nominatim_client.dart

import 'package:dio/dio.dart';
import 'package:dio_cache_interceptor/dio_cache_interceptor.dart';
import 'package:your_app/src/core/network/dio_client.dart'; // Assuming @dio_client.dart maps here

class NominatimClient extends DioClient {
  // Define constants for configuration
  static const _baseUrl = 'https://nominatim.openstreetmap.org';
  static const _connectTimeout = Duration(seconds: 5);
  static const _receiveTimeout = Duration(seconds: 3);

  NominatimClient()
      : super(
          // Provide the Dio instance with BaseOptions
          dioClient: Dio(
            BaseOptions(
              baseUrl: _baseUrl,
              connectTimeout: _connectTimeout,
              receiveTimeout: _receiveTimeout,
              // Add other options like headers if needed
            ),
          ),
          // Configure caching behavior (MemCacheStore is good for short-lived session caches)
          globalCacheOptions: CacheOptions(
            store: MemCacheStore(), // Or HiveCacheStore for persistence
            policy: CachePolicy.request, // Cache responses, check cache before making request
            // Other options: maxStale, priority, keyBuilder, etc.
          ),
        );

  // Add methods here to make specific API calls using `dioClient.get/post/etc.`
  // Example:
  // Future<List<Address>> searchAddress(String query) async {
  //   try {
  //     final response = await dioClient.get('/search', queryParameters: {'q': query, 'format': 'json'});
  //     // Process response.data
  //   } on DioException catch (e) {
  //      // Handle Dio specific errors, potentially throw custom exception
  //   }
  // }
}
```

### 4. Provider Setup (Riverpod)

- **Action:** Use Riverpod to provide the repository implementation throughout the app.
- **Location:** Define the provider in the implementation's file in `data/repositories/` (or a dedicated provider file there), so `domain/` never imports from `data/`.
- **Annotation:** Use the `@riverpod` annotation (from `riverpod_annotation` package) for code generation.
- **Implementation:** The provider function instantiates the *real* implementation (e.g., `FirestoreSavePositionRepository`) and declares the **interface** as its return type (`SavePositionRepository`).
- **Dependencies:** Use `ref.watch(...)` inside the provider function to get instances of required dependencies (like `firebaseFirestoreProvider` from `@firebase_provider.dart` or a `DioClient` provider).

**Example:**

```dart
// File: lib/src/features/position_bookmarks/data/repositories/save_position_repository_provider.dart

import 'package:riverpod_annotation/riverpod_annotation.dart';
import 'package:your_app/src/data/firestore/firebase_providers.dart'; // Assuming @firebase_provider.dart maps here
import 'package:your_app/src/features/position_bookmarks/data/repositories/firestore_save_position_repository.dart'; // Real implementation
import 'package:your_app/src/features/position_bookmarks/domain/repositories/save_position_repository.dart'; // The interface

part 'save_position_repository_provider.g.dart'; // Riverpod generated part

@riverpod
SavePositionRepository savePositionRepository(Ref ref) {
  // Return the real implementation, injecting its dependencies
  return FirestoreSavePositionRepository(
    firestore: ref.watch(firebaseFirestoreProvider), // Get Firestore instance
  );
  // For testing, this provider will be overridden.
}
```

## Best Practices

### Error Handling

- **Catch Specific Exceptions:** Always `catch` specific platform exceptions (`FirebaseException`, `DioException`, etc.) first, before a generic `catch (e)`.
- **Convert Exceptions:** Convert caught platform exceptions into your app-specific custom exceptions (e.g., `SavePositionException`) before throwing them from the repository.
- **Include Context:** Pass the original error message (`e.message`), the original exception (`e`), and the stack trace (`s`) to your custom exception if its constructor supports it, for better debugging.
- **Hide Implementation Details:** Do not expose raw platform error codes or sensitive details in the messages of custom exceptions intended for user feedback or generic logging. Use the `details` or `originalException` fields for internal context.

### Testing Considerations

- **Behavior Parity:** Strive to make the fake implementation's behavior (success cases, error types thrown, data updates) match the real implementation as closely as possible.
- **Simulate Latency:** Always include realistic (but short) `Future.delayed` calls in fake methods to uncover race conditions or issues related to asynchronous operations in UI/controllers.
- **Atomicity:** Ensure fake data modification methods are atomic by operating on copies and assigning the final result back to the `InMemoryStore`.
- **Data Initialization:** Provide ways to easily initialize the fake repository with specific data sets needed for different test scenarios (e.g., via constructor or dedicated setup methods).

### Code Organization

- **Domain Layer:** Place repository interfaces under `lib/src/features/<feature>/domain/repositories/`, entities (like `PositionBookmark`) under `domain/entities/`, and exceptions under `domain/exceptions/`. Repositories depend on domain entities, but not vice-versa.
- **Data Layer:** Place data models under `lib/src/features/<feature>/data/models/` and repository implementations (with their providers) under `data/repositories/`.
- **Shared Repositories:** Place repositories used across multiple features in a shared location (e.g., `lib/src/core/data/` or `lib/src/data/shared/`).

### Documentation

- **Interface:** Thoroughly document the abstract interface methods (`///`), including parameters, return types, and `@throws` annotations for custom exceptions.
- **Implementation:** Document non-obvious implementation details, assumptions about data structures (especially in Firestore paths), or complex logic within the real implementation.
- **Side Effects:** Document any significant side effects of repository methods if they exist (rarely ideal, but sometimes necessary).

### Performance

- **Pagination:** For methods fetching potentially large lists (`fetchSavedPositions`), implement pagination strategies (e.g., using `limit()` and `startAfter()` in Firestore, or page/limit parameters in API calls). The repository interface should reflect this (e.g., `fetchSavedPositions(UserId userId, {String? lastItemId, int limit = 20})`).
- **Indexing:** Ensure appropriate database indexes are configured (e.g., in `firestore.indexes.json`) for fields used in queries (`where`, `orderBy`) to maintain performance.
- **Batching:** Minimize network calls by batching operations where feasible (e.g., using `WriteBatch` in Firestore for multiple writes in one go).
- **Caching:** Utilize caching mechanisms where appropriate:
  - For Firestore, consider Firestore's built-in offline persistence or selectively caching reads in memory if beneficial.
  - For Dio/API calls, use `dio_cache_interceptor` (configured in the `DioClient` implementation) or similar strategies to cache frequently accessed, rarely changing data.

### Security

- **Input Validation:** While primary validation often occurs in controllers/use cases, repositories can perform basic sanity checks on IDs or critical data before interacting with the backend.
- **Error Handling:** Implement robust error handling, ensuring sensitive information from exceptions (stack traces, detailed platform errors) is not inadvertently exposed to end-users. Log detailed errors securely.
- **Platform Best Practices:** Follow platform-specific security guidelines (e.g., Firestore Security Rules to authorize access server-side, HTTPS for API calls, secure handling of API keys/tokens).

### Maintenance

- **Single Responsibility:** Keep repository methods focused on a single, clear purpose related to data operations. Avoid mixing business logic within repositories.
- **Consistent Naming:** Maintain consistent naming conventions for methods, variables, and classes across all repositories.
- **Deprecation:** Document breaking changes in interfaces clearly. Use the `@Deprecated` annotation for methods being phased out, providing guidance on replacements. Regularly clean up deprecated code.
