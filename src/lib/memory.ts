/**
 * Winky AI - Silicon Hippocampus (Memory Engine)
 * Persistence Layer for Cognitive Facts & User Context
 */

export interface MemoryFact {
  key: string;
  value: string;
  timestamp: string;
}

class MemoryManager {
  private STORAGE_KEY = 'winky_cognitive_vault';

  constructor() {
    if (!localStorage.getItem(this.STORAGE_KEY)) {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({}));
    }
  }

  saveFact(key: string, value: string): void {
    const vault = this.getVault();
    vault[key.toLowerCase()] = {
      key,
      value,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(vault));
    console.log(`[Memory] Fact stored: ${key} -> ${value}`);
  }

  searchFacts(query: string): MemoryFact[] {
    const vault = this.getVault();
    const q = query.toLowerCase();
    
    // Simple substring matching for now (could be upgraded to vector search later)
    return Object.values(vault).filter((f: any) => 
      f.key.toLowerCase().includes(q) || 
      f.value.toLowerCase().includes(q)
    ) as MemoryFact[];
  }

  getFact(key: string): MemoryFact | null {
    const vault = this.getVault();
    return vault[key.toLowerCase()] || null;
  }

  getAllFacts(): MemoryFact[] {
    return Object.values(this.getVault());
  }

  private getVault(): Record<string, MemoryFact> {
    const data = localStorage.getItem(this.STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  }

  clearAll(): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify({}));
  }
}

export const memoryManager = new MemoryManager();
