import { describe, it, expect, beforeEach } from "vitest";
import { DocumentTool } from "./document.js";
import { MockLLMClient, createMockLLMClient } from "../__mocks__/llm.js";

describe("DocumentTool", () => {
  let tool: DocumentTool;
  let mockLLM: MockLLMClient;

  beforeEach(() => {
    mockLLM = createMockLLMClient();
    tool = new DocumentTool(mockLLM as any);
  });

  describe("definition", () => {
    it("should have correct name and description", () => {
      expect(tool.definition.name).toBe("document");
      expect(tool.definition.description).toContain("documents");
    });
  });

  describe("document generation", () => {
    const mockDocumentResponse = {
      title: "Test Report",
      documentType: "report",
      content: "This is the full document content.",
      sections: [
        { heading: "Introduction", content: "Introduction content" },
        { heading: "Analysis", content: "Analysis content" },
      ],
      metadata: {
        wordCount: 500,
        generatedAt: new Date().toISOString(),
        tone: "formal",
        audience: "executives",
      },
      suggestions: ["Add more data", "Include charts"],
    };

    it("should generate a report document", async () => {
      mockLLM.addMockResponse("report", mockDocumentResponse);

      const result = await tool.execute({
        type: "report",
        title: "Quarterly Analysis Report",
        context: "Analyze Q4 performance metrics",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.metadata?.documentType).toBe("report");
    });

    it("should generate a brief document", async () => {
      mockLLM.addMockResponse("brief", {
        ...mockDocumentResponse,
        documentType: "brief",
      });

      const result = await tool.execute({
        type: "brief",
        title: "Policy Brief",
        context: "Summarize new AI regulations",
      });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it("should generate a memo document", async () => {
      mockLLM.addMockResponse("memo", {
        ...mockDocumentResponse,
        documentType: "memo",
      });

      const result = await tool.execute({
        type: "memo",
        title: "Team Update",
        context: "Weekly progress update",
      });

      expect(result.success).toBe(true);
    });

    it("should include custom sections when provided", async () => {
      mockLLM.addMockResponse("report", mockDocumentResponse);

      const result = await tool.execute({
        type: "report",
        title: "Custom Report",
        context: "Report with custom sections",
        sections: [
          { heading: "Executive Summary", requirements: "High-level overview" },
          { heading: "Detailed Analysis", requirements: "In-depth analysis" },
          { heading: "Recommendations", requirements: "Action items" },
        ],
      });

      expect(result.success).toBe(true);
      expect(mockLLM.calls[0].messages[0].content).toContain("Executive Summary");
      expect(mockLLM.calls[0].messages[0].content).toContain("Detailed Analysis");
    });

    it("should apply style preferences", async () => {
      mockLLM.addMockResponse("report", mockDocumentResponse);

      await tool.execute({
        type: "report",
        title: "Executive Report",
        context: "Report for executives",
        style: {
          tone: "executive",
          length: "brief",
          audience: "C-suite executives",
        },
      });

      const options = mockLLM.calls[0].options as { systemPrompt?: string };
      expect(options.systemPrompt).toContain("C-suite executives");
      expect(options.systemPrompt).toContain("executive");
    });

    it("should incorporate provided data", async () => {
      mockLLM.addMockResponse("analysis", mockDocumentResponse);

      await tool.execute({
        type: "analysis",
        title: "Data Analysis",
        context: "Analyze the provided metrics",
        data: {
          revenue: 1000000,
          growth: 0.15,
          customers: 500,
        },
      });

      const prompt = mockLLM.calls[0].messages[0].content;
      expect(prompt).toContain("revenue");
      expect(prompt).toContain("1000000");
    });
  });

  describe("input validation", () => {
    it("should reject invalid document type", async () => {
      const result = await tool.execute({
        type: "invalid_type",
        title: "Test",
        context: "Test context",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject missing title", async () => {
      const result = await tool.execute({
        type: "report",
        context: "Test context",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should reject missing context", async () => {
      const result = await tool.execute({
        type: "report",
        title: "Test Title",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("style guide generation", () => {
    it("should generate formal tone guide", async () => {
      mockLLM.addMockResponse("report", {
        title: "Test",
        documentType: "report",
        content: "",
        sections: [],
        metadata: { wordCount: 0, generatedAt: "", tone: "formal", audience: "" },
      });

      await tool.execute({
        type: "report",
        title: "Formal Report",
        context: "Test",
        style: { tone: "formal" },
      });

      const systemPrompt = mockLLM.calls[0].options;
      expect((systemPrompt as any).systemPrompt).toContain("formal language");
    });

    it("should generate technical tone guide", async () => {
      mockLLM.addMockResponse("report", {
        title: "Test",
        documentType: "report",
        content: "",
        sections: [],
        metadata: { wordCount: 0, generatedAt: "", tone: "technical", audience: "" },
      });

      await tool.execute({
        type: "report",
        title: "Technical Report",
        context: "Test",
        style: { tone: "technical" },
      });

      const systemPrompt = mockLLM.calls[0].options;
      expect((systemPrompt as any).systemPrompt).toContain("technical terminology");
    });
  });
});
