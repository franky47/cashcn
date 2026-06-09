import * as errore from "errore";

// Domain errors, returned as values (errore convention) rather than thrown.
// `$var` placeholders are interpolated from the constructor args and exposed as
// typed properties on the instance.

export class InvalidAmountError extends errore.createTaggedError({
  name: "InvalidAmountError",
  message: "$reason",
}) {}

export class InvalidDestinationError extends errore.createTaggedError({
  name: "InvalidDestinationError",
  message: "$reason",
}) {}

export class UnknownVerbError extends errore.createTaggedError({
  name: "UnknownVerbError",
  message: 'Unknown verb "$verb". Try one of: $verbs.',
}) {}

export class UsageError extends errore.createTaggedError({
  name: "UsageError",
  message: "$reason",
}) {}

export class NoFundingTargetsError extends errore.createTaggedError({
  name: "NoFundingTargetsError",
  message: 'No funding destinations found for "$destination".',
}) {}

export class NpmRegistryError extends errore.createTaggedError({
  name: "NpmRegistryError",
  message: "$reason",
}) {}

export class FundingYmlError extends errore.createTaggedError({
  name: "FundingYmlError",
  message: "$reason",
}) {}
