---
name: "advanced-typescript-modeling"
description: "Advanced TypeScript modeling patterns, type-safety, schemas, and API design inspired by Matt Pocock."
---

# Advanced TypeScript Modeling & Type Safety

This skill encapsulates advanced TypeScript API design, type narrowing, schema validation, and defensive typing practices inspired by Matt Pocock.

## Core Guidelines

### 1. Discriminated Unions for Polymorphism
When modeling nodes, events, or configs that share a base but have distinct fields, always use discriminated unions to allow TypeScript to narrow types:
```typescript
interface VectorMemory {
  type: 'vector';
  contains: string[];
  write_access: boolean;
  poisoning_protection: boolean;
}

interface CacheMemory {
  type: 'cache';
  ttl_seconds: number;
}

interface NoMemory {
  type: 'none';
}

type AgentMemory = VectorMemory | CacheMemory | NoMemory;
```

### 2. Type Guarding & Schema Coercion
- Validate schemas at runtime boundaries (using Ajv or Zod) to assert input conforms to types.
- Once validated, cast or coerce the data into its strong type so type assertions (`as AnyType`) are avoided throughout the business logic.
- Use custom type guards (`function isVectorMemory(mem: AgentMemory): mem is VectorMemory`) to cleanly handle conditional logic.

### 3. Clear Typings for CLI Command Args
- Explicitly define interfaces for command configurations and option flags.
- Avoid passing untyped options around; pass structured objects with strict property maps.
- Exclude `any` type configurations where possible, enforcing `unknown` if types are dynamic and using type narrowing.
