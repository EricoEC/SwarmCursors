.PHONY: project ext ios device visionos visionos-sim macos all clean

project:
	xcodegen generate

ext:
	node tools/build-extension.mjs

ios:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
		-destination 'generic/platform=iOS Simulator' -configuration Debug build

# Device build. -allowProvisioningUpdates lets Xcode mint/repair profiles
# automatically; without it a stale profile reference fails the signing step.
device:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
		-destination 'generic/platform=iOS' -configuration Debug \
		-allowProvisioningUpdates build

visionos:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
		-destination 'generic/platform=visionOS' -configuration Debug build

visionos-sim:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
		-destination 'generic/platform=visionOS Simulator' -configuration Debug build

macos:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors \
		-destination 'generic/platform=macOS' -configuration Debug build

all: ios visionos macos

clean:
	xcodebuild -project SwarmCursors.xcodeproj -scheme SwarmCursors clean
