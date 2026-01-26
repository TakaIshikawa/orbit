import { describe, it, expect, beforeEach } from "vitest";
import { ResearchTool } from "./research.js";
import { MockLLMClient, createMockLLMClient } from "../__mocks__/llm.js";

describe("ResearchTool", () => {
  let tool: ResearchTool;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLMClient();
    tool = new ResearchTool(mockLLM as any);
  });

  describe("definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("research");
      expect(tool.definition.description).toContain("web research");
    });
  });

  describe("web_search", () => {
    it("should perform web search and return results", async () => {
      mockLLM.addMockResponse("web search", {
        results: [
          {
            title: "Test Result",
            url: "https://example.com/test",
            snippet: "This is a test result",
            relevance: 0.9,
          },
        ],
        totalFound: 1,
        query: "AI policy",
      });

      const result = await tool.execute({
        type: "web_search",
        query: "AI policy regulations",
        maxResults: 5,
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).type).toBe("web_search");
      expect((result.data as any).result.results).toBeDefined();
    });

    it("should use default maxResults when not specified", async () => {
      mockLLM.addMockResponse("web search", {
        results: [],
        totalFound: 0,
        query: "test",
      });

      await tool.execute({
        type: "web_search",
        query: "test query",
      });

      expect(mockLLM.calls.length).toBe(1);
      expect(mockLLM.calls[0].messages[0].content).toContain("10");
    });
  });

  describe("fetch_url", () => {
    it("should fetch URL and return content", async () => {
      mockLLM.addMockResponse("Simulate fetching", {
        url: "https://example.com",
        title: "Example Page",
        content: "This is example content",
        contentType: "text/html",
        fetchedAt: new Date().toISOString(),
      });

      const result = await tool.execute({
        type: "fetch_url",
        query: "https://example.com/article",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).type).toBe("fetch_url");
      expect((result.data as any).result.url).toBe("https://example.com/article");
    });
  });

  describe("analyze_content", () => {
    it("should analyze content and return structured insights", async () => {
      mockLLM.addMockResponse("Analyze the following", {
        summary: "This is a summary of the content",
        keyPoints: ["Point 1", "Point 2"],
        entities: [{ name: "Test Entity", type: "organization", relevance: 0.8 }],
        sentiment: "neutral",
        topics: ["technology", "policy"],
      });

      const result = await tool.execute({
        type: "analyze_content",
        query: "Analyze this",
        content: "This is some content to analyze about AI policy and regulations.",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect((result.data as any).type).toBe("analyze_content");
      expect((result.data as any).result.summary).toBeDefined();
    });

    it("should fail when content is not provided", async () => {
      const result = await tool.execute({
        type: "analyze_content",
        query: "Analyze",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Content is required");
    });

    it("should handle extract schema for structured extraction", async () => {
      mockLLM.addMockResponse("Analyze the following", {
        summary: "Summary",
        keyPoints: [],
        entities: [],
        sentiment: "neutral",
        topics: [],
        extractedData: { customField: "value" },
      });

      const result = await tool.execute({
        type: "analyze_content",
        query: "Extract data",
        content: "Content with custom fields",
        extractSchema: { customField: "string" },
      });

      expect(result.success).toBe(true);
    });
  });

  describe("input validation", () => {
    it("should reject invalid input type", async () => {
      const result = await tool.execute({
        type: "invalid_type",
        query: "test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject missing query", async () => {
      const result = await tool.execute({
        type: "web_search",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
