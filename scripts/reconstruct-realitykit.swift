import Foundation
import RealityKit

@main
struct ReconstructRealityKit {
    static func main() async {
        guard CommandLine.arguments.count == 3 else {
            fputs("Usage: reconstruct-realitykit INPUT_IMAGE_DIRECTORY OUTPUT_DIRECTORY\n", stderr)
            exit(2)
        }

        guard PhotogrammetrySession.isSupported else {
            fputs("RealityKit Object Capture is unavailable on this Mac.\n", stderr)
            exit(1)
        }

        let input = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let output = URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)
        var configuration = PhotogrammetrySession.Configuration()
        configuration.sampleOrdering = .sequential
        configuration.isObjectMaskingEnabled = false
        configuration.ignoreBoundingBox = true

        do {
            let session = try PhotogrammetrySession(input: input, configuration: configuration)
            let request = PhotogrammetrySession.Request.modelFile(url: output, detail: .reduced)
            try session.process(requests: [request])

            for try await event in session.outputs {
                switch event {
                case .inputComplete:
                    print("Input loaded")
                case .invalidSample(let id, let reason):
                    print("Invalid sample \(id): \(reason)")
                case .requestProgress(_, let fraction):
                    print(String(format: "Progress %.1f%%", fraction * 100))
                case .requestComplete(_, let result):
                    print("Result: \(result)")
                case .requestError(_, let error):
                    fputs("Reconstruction error: \(error)\n", stderr)
                    exit(1)
                case .processingComplete:
                    print("Processing complete")
                    return
                case .processingCancelled:
                    fputs("Processing cancelled\n", stderr)
                    exit(1)
                default:
                    break
                }
            }
        } catch {
            fputs("Reconstruction failed: \(error)\n", stderr)
            exit(1)
        }
    }
}
