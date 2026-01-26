import { describe, it, expect, beforeEach } from "vitest";
import { CodeTool } from "./code.js";
import { MockLLMClient, createMockLLMClient } from "../__mocks__/llm.js";

describe("CodeTool", () => {
  let tool: CodeTool;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLMClient();
    tool = new CodeTool(mockLLM as any);
  });

  describe("definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("code");
      expect(tool.definition.description).toContain("Generates");
    });
  });

  describe("generate", () => {
    const mockGenerateResponse = {
      task: "generate" as const,
      files: [
        {
          filename: "utils.ts",
          content: "export function add(a: number, b: number): number { return a + b; }",
          language: "typescript",
          description: "Utility functions",
        },
      ],
      explanation: "Generated utility functions for basic arithmetic",
      usage: "import { add } from './utils'",
    };

    it("should generate code files", async () => {
      mockLLM.addMockResponse("Generate code", mockGenerateResponse);

      const result = await tool.execute({
        task: "generate",
        language: "typescript",
        description: "Create a utility function to add two numbers",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).task).toBe("generate");
      expect((result.data as any).files).toBeDefined();
    });

    it("should include context in prompt", async () => {
      mockLLM.addMockResponse("Generate code", mockGenerateResponse);

      await tool.execute({
        task: "generate",
        language: "typescript",
        description: "Create a React component",
        context: {
          framework: "React",
          dependencies: ["react", "react-dom"],
          codeStyle: "functional components with hooks",
        },
      });

      const prompt = mockLLM.calls[0].messages[0].content;
      expect(prompt).toContain("React");
      expect(prompt).toContain("react-dom");
      expect(prompt).toContain("functional components");
    });

    it("should include requirements in prompt", async () => {
      mockLLM.addMockResponse("Generate code", mockGenerateResponse);

      await tool.execute({
        task: "generate",
        language: "python",
        description: "Create a data processor",
        requirements: ["Handle errors gracefully", "Support async operations"],
      });

      const prompt = mockLLM.calls[0].messages[0].content;
      expect(prompt).toContain("Handle errors gracefully");
      expect(prompt).toContain("Support async operations");
    });
  });

  describe("refactor", () => {
    const existingCode = `
function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total = total + items[i].price;
  }
  return total;
}`;

    const mockRefactorResponse = {
      task: "refactor" as const,
      files: [
        {
          filename: "calculator.ts",
          content: "const calculateTotal = (items: Item[]) => items.reduce((sum, item) => sum + item.price, 0);",
          language: "typescript",
          description: "Refactored calculator function",
        },
      ],
      changes: [
        "Converted to arrow function",
        "Used reduce instead of for loop",
        "Added TypeScript types",
      ],
      rationale: "Modern JavaScript patterns improve readability and type safety",
    };

    it("should refactor existing code", async () => {
      mockLLM.addMockResponse("Refactor", mockRefactorResponse);

      const result = await tool.execute({
        task: "refactor",
        language: "typescript",
        description: "Modernize and add type safety",
        existingCode,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).task).toBe("refactor");
      expect((result.data as any).changes).toBeDefined();
    });

    it("should fail when existingCode is not provided", async () => {
      const result = await tool.execute({
        task: "refactor",
        language: "typescript",
        description: "Refactor this",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("existingCode is required");
    });
  });

  describe("review", () => {
    const codeToReview = `
function processData(data) {
  eval(data.command);
  return data.value * 2;
}`;

    const mockReviewResponse = {
      task: "review" as const,
      review: {
        summary: "Code has critical security issues",
        issues: [
          {
            severity: "error" as const,
            line: 2,
            message: "Use of eval() is dangerous and can lead to code injection",
            suggestion: "Use a safer alternative like JSON.parse() or a proper parser",
          },
        ],
        metrics: {
          complexity: "low" as const,
          maintainability: "poor" as const,
          testability: "fair" as const,
        },
        recommendations: ["Remove eval()", "Add input validation", "Add TypeScript types"],
      },
    };

    it("should review code and identify issues", async () => {
      mockLLM.addMockResponse("Review", mockReviewResponse);

      const result = await tool.execute({
        task: "review",
        language: "javascript",
        description: "Security review",
        existingCode: codeToReview,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).task).toBe("review");
      expect((result.data as any).review.issues).toBeDefined();
    });

    it("should fail when existingCode is not provided", async () => {
      const result = await tool.execute({
        task: "review",
        language: "javascript",
        description: "Review this",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("existingCode is required");
    });
  });

  describe("explain", () => {
    const codeToExplain = `
const memoize = (fn) => {
  const cache = new Map();
  return (...args) => {
    const key = JSON.stringify(args);
    if (!cache.has(key)) cache.set(key, fn(...args));
    return cache.get(key);
  };
};`;

    const mockExplainResponse = {
      task: "explain" as const,
      explanation: {
        summary: "A higher-order function that caches function results",
        sections: [
          { lines: "1-2", explanation: "Creates a closure with a Map for caching" },
          { lines: "3-6", explanation: "Returns a wrapper that checks cache before calling" },
        ],
        concepts: [
          { term: "Memoization", definition: "Caching function results to avoid repeated computation" },
          { term: "Higher-order function", definition: "A function that takes or returns a function" },
        ],
        flowDescription: "Function receives another function, creates cache, returns wrapper",
      },
    };

    it("should explain code clearly", async () => {
      mockLLM.addMockResponse("Explain", mockExplainResponse);

      const result = await tool.execute({
        task: "explain",
        language: "javascript",
        description: "Explain this memoization function",
        existingCode: codeToExplain,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).task).toBe("explain");
      expect((result.data as any).explanation.summary).toBeDefined();
    });

    it("should fail when existingCode is not provided", async () => {
      const result = await tool.execute({
        task: "explain",
        language: "javascript",
        description: "Explain this",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("existingCode is required");
    });
  });

  describe("test", () => {
    const codeToTest = `
export function divide(a: number, b: number): number {
  if (b === 0) throw new Error("Division by zero");
  return a / b;
}`;

    const mockTestResponse = {
      task: "test" as const,
      tests: {
        testFramework: "vitest",
        testFiles: [
          {
            filename: "divide.test.ts",
            content: `import { describe, it, expect } from "vitest";
import { divide } from "./divide";

describe("divide", () => {
  it("should divide two numbers", () => {
    expect(divide(10, 2)).toBe(5);
  });

  it("should throw on division by zero", () => {
    expect(() => divide(10, 0)).toThrow("Division by zero");
  });
});`,
            language: "typescript",
            description: "Tests for divide function",
          },
        ],
        coverage: {
          functions: ["divide"],
          edgeCases: ["division by zero", "negative numbers", "decimal results"],
        },
      },
    };

    it("should generate tests for code", async () => {
      mockLLM.addMockResponse("Generate tests", mockTestResponse);

      const result = await tool.execute({
        task: "test",
        language: "typescript",
        description: "Generate comprehensive tests",
        existingCode: codeToTest,
      });

      expect(result.success).toBe(true);
      expect((result.data as any).task).toBe("test");
      expect((result.data as any).tests.testFiles).toBeDefined();
    });

    it("should fail when existingCode is not provided", async () => {
      const result = await tool.execute({
        task: "test",
        language: "typescript",
        description: "Generate tests",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("existingCode is required");
    });
  });

  describe("input validation", () => {
    it("should reject invalid task type", async () => {
      const result = await tool.execute({
        task: "invalid_task",
        language: "typescript",
        description: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject missing language", async () => {
      const result = await tool.execute({
        task: "generate",
        description: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject missing description", async () => {
      const result = await tool.execute({
        task: "generate",
        language: "typescript",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
