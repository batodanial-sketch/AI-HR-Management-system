"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  User,
  Briefcase,
  Mail,
  MessageSquare,
  Send,
  Sliders,
  Copy,
  CheckCircle,
  Clock,
  Plus,
  Minus,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/use-toast";

// Types
interface Candidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  title: string;
  company: string;
  experienceYears: number;
  skills: string[];
  score: number;
  appliedDate: string;
  profileImage?: string;
}

interface Job {
  id: string;
  title: string;
  department: string;
  company: string;
  location: string;
  salaryRange: string;
  remotePolicy: "office" | "hybrid" | "remote";
  urgent: boolean;
  skillsRequired: string[];
  experienceRequired: number;
}

interface OutreachEmail {
  id: string;
  subject: string;
  body: string;
  channel: "email" | "linkedin" | "sms";
  tone: "formal" | "direct" | "startup-casual";
  action: "initial-pitch" | "screening-invitation" | "rejection";
  followUpDays: number;
  isGenerated: boolean;
  isEdited?: boolean;
}

interface OutreachStudioProps {
  candidate?: Candidate;
  job?: Job;
  open?: boolean;
  onClose: () => void;
  onGenerate?: (email: OutreachEmail) => void;
}

// Utility functions
const generateId = () => Math.random().toString(36).substr(2, 9);

// Mock candidates for demo
const mockCandidates: Candidate[] = [
  {
    id: "1",
    firstName: "Sarah",
    lastName: "Johnson",
    email: "sarah.j@email.com",
    title: "Senior Frontend Developer",
    company: "TechCorp",
    experienceYears: 5,
    skills: ["React", "TypeScript", "Node.js", "GraphQL"],
    score: 87,
    appliedDate: "2024-01-15",
    profileImage: "https://ui-avatars.com/api/?name=Sarah+Johnson&background=random",
  },
  {
    id: "2",
    firstName: "Michael",
    lastName: "Chen",
    email: "mchen@email.com",
    title: "Full Stack Engineer",
    company: "StartupXYZ",
    experienceYears: 3,
    skills: ["Python", "AWS", "Docker", "Kubernetes"],
    score: 92,
    appliedDate: "2024-01-20",
    profileImage: "https://ui-avatars.com/api/?name=Michael+Chen&background=random",
  },
];

// Mock jobs for demo
const mockJobs: Job[] = [
  {
    id: "1",
    title: "Senior Frontend Developer",
    department: "Engineering",
    company: "TechCorp",
    location: "San Francisco, CA",
    salaryRange: "$120k - $150k",
    remotePolicy: "hybrid",
    urgent: false,
    skillsRequired: ["React", "TypeScript", "Node.js", "GraphQL"],
    experienceRequired: 4,
  },
  {
    id: "2",
    title: "Full Stack Engineer",
    department: "Product",
    company: "StartupXYZ",
    location: "Remote",
    salaryRange: "$100k - $130k",
    remotePolicy: "remote",
    urgent: true,
    skillsRequired: ["Python", "AWS", "Docker", "Kubernetes", "React"],
    experienceRequired: 3,
  },
];

export function OutreachStudio({
  candidate = mockCandidates[0],
  job = mockJobs[0],
  open = false,
  onClose,
  onGenerate,
}: OutreachStudioProps) {
  const [selectedAction, setSelectedAction] = useState<"initial-pitch" | "screening-invitation" | "rejection">("initial-pitch");
  const [selectedTone, setSelectedTone] = useState<"formal" | "direct" | "startup-casual">("formal");
  const [followUpDays, setFollowUpDays] = useState(7);
  const [activeChannel, setActiveChannel] = useState<"email" | "linkedin" | "sms">("email");
  const [showCustomSubject, setShowCustomSubject] = useState(false);
  const [showCustomTemplate, setShowCustomTemplate] = useState(false);
  const [variations, setVariations] = useState<OutreachEmail[]>([]);
  const [currentVariant, setCurrentVariant] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  // Initialize on component mount or when candidate/job changes
  useEffect(() => {
    // Generate initial email
    generateEmail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [candidate, job, selectedAction, selectedTone, followUpDays]);

  const generateEmail = async () => {
    setIsGenerating(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));

      const templates = [
        {
          subject: `Excited to discuss ${candidate.title} opportunity at ${candidate.company}`,
          body: `Hi ${candidate.firstName},

I hope this email finds you well. I recently came across your profile as a ${candidate.title} with impressive experience at ${candidate.company}, and we're looking to bring you on board for our ${job.title} role.

Given your background in ${candidate.skills.slice(0, 2).join(", ")}, I believe you'd be an excellent fit for our team.

Would you be open to a brief conversation about this opportunity?

Best regards,
Hiring Team`,
        },
        {
          subject: `Join ${job.company} as ${job.title}`,
          body: `Hello ${candidate.firstName},

I'm reaching out to explore your interest in our ${job.title} position at ${job.company}. With your ${candidate.experienceYears} years of experience in ${candidate.skills.slice(0, 2).join(", ")}, you'd be a great addition to our team.

Could we schedule a quick 15-minute chat this week?

Looking forward to hearing from you!

Warm regards,
${job.company} Recruiting Team`,
        },
      ];

      const selectedTemplate = templates[Math.floor(Math.random() * templates.length)];

      const newEmail: OutreachEmail = {
        id: generateId(),
        subject: selectedTemplate.subject,
        body: selectedTemplate.body,
        channel: activeChannel,
        tone: selectedTone,
        action: selectedAction,
        followUpDays,
        isGenerated: true,
        isEdited: false,
      };

      if (variations.length === 0) {
        setVariations([newEmail]);
      } else {
        setVariations(prev => [...prev, newEmail]);
      }
      setSubject(newEmail.subject);
      setBody(newEmail.body);
      setCurrentVariant(variations.length);
    } catch (error) {
      console.error("Failed to generate email:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAddVariable = (variable: string) => {
    const textarea = document.querySelector(".email-body-textarea") as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = body.substring(0, start) + variable + body.substring(end);
      setBody(newText);
      textarea.focus();
      setTimeout(() => {
        textarea.setSelectionRange(start + variable.length, start + variable.length);
      }, 0);
    }
  };

  const handleEnrollInSequence = async () => {
    try {
      const response = await fetch("/api/outreach/sequence/enroll", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          candidateId: candidate?.id,
          jobId: job?.id,
          subject,
          body,
          suggestedFollowUpDays: [0, followUpDays, followUpDays * 2],
          tone: selectedTone,
          action: selectedAction,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to enroll in sequence");
      }

      const data = await response.json();
      toast({
        title: "Sequence Enrolled",
        description: `Outreach sequence started for ${candidate?.firstName} ${candidate?.lastName}`,
      });

      // Close the studio after successful enrollment
      onClose();
    } catch (error) {
      console.error("Failed to enroll in sequence:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to enroll in sequence",
        variant: "destructive",
      });
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(body);
      // Show toast notification (would use toast library in real app)
    } catch (error) {
      console.error("Failed to copy:", error);
    }
  };

  const renderChannelContent = () => {
    const maxLength = activeChannel === "linkedin" ? 300 : activeChannel === "sms" ? 160 : 5000;
    const remaining = maxLength - body.length;

    return (
      <div className="space-y-4">
        <div className="relative">
          <Textarea
            placeholder="Email body here...\n            Hint: Use {{firstName}}, {{lastName}}, {{companyName}}, {{jobTitle}}, {{skill}} variables\n            to personalize your message."
            className="min-h-[200px] resize-y font-mono text-sm email-body-textarea"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={maxLength}
          />
          <div className="absolute bottom-2 right-2 text-xs text-muted-foreground">
            {remaining} chars remaining
          </div>
        </div>

        {activeChannel === "email" && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>Preview mode: Reply-to will be set to {candidate.email}</span>
          </div>
        )}

        {activeChannel === "linkedin" && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
            <p className="text-sm font-medium">LinkedIn DM Notes:</p>
            <ul className="mt-1 text-xs space-y-1">
              <li>• Keep it personal and under 300 characters</li>
              <li>• Reference mutual connections or shared interests</li>
              <li>• Include a clear call-to-action</li>
            </ul>
          </div>
        )}

        {activeChannel === "sms" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
            <p className="text-sm font-medium">SMS Quick Touch Notes:</p>
            <ul className="mt-1 text-xs space-y-1">
              <li>• Brevity is key under 160 characters</li>
              <li>• Use clear, direct language</li>
              <li>• Include response shortcut (e.g., "REPLY Y for interview")</li>
            </ul>
          </div>
        )}
      </div>
    );
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260, mass: 1 }}
            className="absolute right-0 top-0 h-full w-full max-w-5xl bg-background border-l border-border p-0 md:p-6 overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex-shrink-0 border-b border-border bg-background/95 backdrop-blur-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="hidden md:flex"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <div>
                    <h2 className="text-xl font-semibold">Outreach Studio</h2>
                    <p className="text-sm text-muted-foreground">
                      {candidate.firstName} {candidate.lastName} → {job.title} at {job.company}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={candidate.score >= 90 ? "default" : candidate.score >= 80 ? "secondary" : "outline"}>
                    Match: {candidate.score}%
                  </Badge>
                  <Badge variant="outline">
                    {candidate.experienceYears} years
                  </Badge>
                  <Badge variant="secondary">
                    Applied {candidate.appliedDate}
                  </Badge>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="md:hidden"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Control Panel Tabs */}
              <Tabs defaultValue="composition" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="composition">Composition</TabsTrigger>
                  <TabsTrigger value="variations">Variations</TabsTrigger>
                  <TabsTrigger value="timeline">Timeline</TabsTrigger>
                </TabsList>

                <TabsContent value="composition" className="mt-4 space-y-6">
                  {/* Action Type Selector */}
                  <div>
                    <label className="text-sm font-medium mb-3 block">Action Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "initial-pitch", label: "Initial Pitch", icon: "Mail" as const },
                        { id: "screening-invitation", label: "Screening", icon: "User" as const },
                        { id: "rejection", label: "Rejection", icon: "Send" as const },
                      ] as const).map((action) => {
                        const Icon = action.icon === "Mail" ? Mail : action.icon === "User" ? User : Send;
                        return (
                          <Button
                            key={action.id}
                            variant={selectedAction === action.id ? "default" : "outline"}
                            className={cn(
                              "h-auto py-3",
                              selectedAction === action.id && "ring-2 ring-offset-2"
                            )}
                            onClick={() => setSelectedAction(action.id as typeof selectedAction)}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {action.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Tone Selector */}
                  <div>
                    <label className="text-sm font-medium mb-3 block">Tone</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "formal", label: "Formal" },
                        { id: "direct", label: "Direct" },
                        { id: "startup-casual", label: "Casual" },
                      ] as const).map((toneOption) => (
                        <Button
                          key={toneOption.id}
                          variant={selectedTone === toneOption.id ? "default" : "outline"}
                          onClick={() => setSelectedTone(toneOption.id as typeof selectedTone)}
                          className={cn(
                            "h-auto py-3",
                            selectedTone === toneOption.id && "ring-2 ring-offset-2"
                          )}
                        >
                          {toneOption.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Follow-up Days */}
                  <div>
                    <label className="text-sm font-medium mb-3 block">Follow-up Days</label>
                    <Input
                      type="number"
                      value={followUpDays}
                      onChange={(e) => setFollowUpDays(Number(e.target.value))}
                      min={0}
                      className="w-24"
                    />
                  </div>

                  {/* Channel Selector */}
                  <div>
                    <label className="text-sm font-medium mb-3 block">Channel</label>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { id: "email", label: "Email", icon: "Mail" as const },
                        { id: "linkedin", label: "LinkedIn", icon: "MessageSquare" as const },
                        { id: "sms", label: "SMS", icon: "Send" as const },
                      ] as const).map((channelOption) => {
                        const Icon = channelOption.icon === "Mail" ? Mail : channelOption.icon === "MessageSquare" ? MessageSquare : Send;
                        return (
                          <Button
                            key={channelOption.id}
                            variant={activeChannel === channelOption.id ? "default" : "outline"}
                            onClick={() => setActiveChannel(channelOption.id as typeof activeChannel)}
                            className={cn(
                              "h-auto py-3",
                              activeChannel === channelOption.id && "ring-2 ring-offset-2"
                            )}
                          >
                            <Icon className="h-4 w-4 mr-2" />
                            {channelOption.label}
                          </Button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Custom Subject & Template Switches */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="custom-subject" className="text-sm font-medium">Custom Subject</label>
                    <Switch
                      id="custom-subject"
                      checked={showCustomSubject}
                      onCheckedChange={setShowCustomSubject}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="custom-template" className="text-sm font-medium">Custom Template</label>
                    <Switch
                      id="custom-template"
                      checked={showCustomTemplate}
                      onCheckedChange={setShowCustomTemplate}
                    />
                  </div>

                  {showCustomSubject && (
                    <Input
                      placeholder="Custom Subject Line"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="mt-2"
                    />
                  )}

                  {showCustomTemplate && (
                    <Textarea
                      placeholder="Write your custom email template here..."
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      className="mt-2 min-h-[150px]"
                    />
                  )}

                  {/* Generate Button */}
                  <Button
                    onClick={generateEmail}
                    disabled={isGenerating}
                    className="w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white"
                  >
                    {isGenerating ? "Generating..." : "Generate Outreach Email"}
                  </Button>
                </TabsContent>

                <TabsContent value="variations" className="mt-4 space-y-6">
                  <Card className="bg-gray-50">
                    <CardHeader>
                      <CardTitle className="text-base">Variations ({variations.length})</CardTitle>
                      <CardDescription>Generated AI suggestions for your outreach.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {variations.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No variations generated yet. Generate an email to see options.</p>
                      ) : (
                        <div className="space-y-4">
                          {variations.map((variant, index) => (
                            <div
                              key={variant.id}
                              className={cn(
                                "p-3 border rounded-lg cursor-pointer",
                                index === currentVariant
                                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500"
                                  : "border-border hover:bg-muted/50"
                              )}
                              onClick={() => {
                                setCurrentVariant(index);
                                setSubject(variant.subject);
                                setBody(variant.body);
                              }}
                            >
                              <p className="text-sm font-medium truncate">{variant.subject}</p>
                              <p className="text-xs text-muted-foreground line-clamp-2">{variant.body}</p>
                            </div>
                          ))}
                          <div className="flex justify-between items-center">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentVariant(prev => Math.max(0, prev - 1))}
                              disabled={currentVariant === 0}
                            >
                              <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                            </Button>
                            <span className="text-sm text-muted-foreground">
                              {currentVariant + 1} / {variations.length}
                            </span>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCurrentVariant(prev => Math.min(variations.length - 1, prev + 1))}
                              disabled={currentVariant === variations.length - 1}
                            >
                              Next <ChevronRight className="h-4 w-4 ml-1" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="timeline" className="mt-4 space-y-6">
                  <Card className="bg-gray-50">
                    <CardHeader>
                      <CardTitle className="text-base">Outreach Timeline</CardTitle>
                      <CardDescription>Visualizing your planned outreach steps.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="relative pl-8">
                        {/* Initial email */}
                        <div className="absolute left-0 top-0 h-full w-px bg-gray-300"></div>
                        <div className="relative mb-8">
                          <div className="absolute -left-3 top-0 h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">1</div>
                          <p className="ml-6 text-sm font-semibold">Initial Email</p>
                          <p className="ml-6 text-xs text-muted-foreground">Sent today ({new Date().toLocaleDateString()})</p>
                        </div>

                        {/* Follow-up 1 */}
                        <div className="relative mb-8">
                          <div className="absolute -left-3 top-0 h-6 w-6 rounded-full bg-indigo-500 flex items-center justify-center text-white text-xs font-bold">2</div>
                          <p className="ml-6 text-sm font-semibold">Follow-up 1</p>
                          <p className="ml-6 text-xs text-muted-foreground">In {followUpDays} days ({(new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000)).toLocaleDateString()})</p>
                        </div>

                        {/* Follow-up 2 */}
                        <div className="relative mb-8">
                          <div className="absolute -left-3 top-0 h-6 w-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold">3</div>
                          <p className="ml-6 text-sm font-semibold">Follow-up 2</p>
                          <p className="ml-6 text-xs text-muted-foreground">In {followUpDays * 2} days ({(new Date(Date.now() + followUpDays * 2 * 24 * 60 * 60 * 1000)).toLocaleDateString()})</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Email Composer */}
            <div className="flex-1 flex flex-col p-4 md:p-6 overflow-hidden">
              <h3 className="text-lg font-semibold mb-4">Email Composer</h3>
              <div className="flex-1 flex flex-col space-y-4 overflow-auto">
                <Input
                  placeholder="Subject Line"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="font-medium"
                />
                {renderChannelContent()}
              </div>

              <div className="flex-shrink-0 mt-4 flex items-center justify-between">
                <div>
                  <Button variant="ghost" onClick={copyToClipboard} className="text-sm">
                    <Copy className="h-4 w-4 mr-2" /> Copy to Clipboard
                  </Button>
                </div>
                <Button
                  onClick={handleEnrollInSequence}
                  disabled={isGenerating || !subject.trim() || !body.trim()}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white"
                >
                  <Send className="h-4 w-4 mr-2" /> Enroll in Sequence
                </Button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
