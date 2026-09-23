# HCM contract-first implementation

Design request/response/event DTO contracts after FDD/TDD approval and before persistence implementation. Contracts live in runtime-universal HCM contract libraries. Angular and NestJS may depend on contracts; Angular never imports backend domain/persistence code.
