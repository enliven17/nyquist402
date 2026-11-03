.PHONY: build test fmt lint

build:
	stellar contract build

test:
	cargo test

fmt:
	cargo fmt --all

lint:
	cargo clippy --all-targets -- -D warnings
