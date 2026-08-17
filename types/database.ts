export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      collection_sites: {
        Row: {
          city: string
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          state: string
          type: string
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          state: string
          type: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          state?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      collectors: {
        Row: {
          accuracy_score: number | null
          created_at: string
          id: string
          is_active: boolean
          is_trusted: boolean
          name: string
          phone: string
          submission_count: number
          updated_at: string
        }
        Insert: {
          accuracy_score?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_trusted?: boolean
          name: string
          phone: string
          submission_count?: number
          updated_at?: string
        }
        Update: {
          accuracy_score?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          is_trusted?: boolean
          name?: string
          phone?: string
          submission_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      commodities: {
        Row: {
          aliases: string[]
          canonical_name: string
          category: string
          commodity_group: string
          created_at: string
          default_unit_id: string
          display_order: number
          icon: string | null
          id: string
          is_active: boolean
          is_tracked: boolean
          seasonality_profile: Json | null
          site_offset_pct: number | null
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          canonical_name: string
          category: string
          commodity_group: string
          created_at?: string
          default_unit_id: string
          display_order: number
          icon?: string | null
          id?: string
          is_active?: boolean
          is_tracked?: boolean
          seasonality_profile?: Json | null
          site_offset_pct?: number | null
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          canonical_name?: string
          category?: string
          commodity_group?: string
          created_at?: string
          default_unit_id?: string
          display_order?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          is_tracked?: boolean
          seasonality_profile?: Json | null
          site_offset_pct?: number | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "commodities_default_unit_id_fkey"
            columns: ["default_unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          source: string
          starts_at: string
          tier: Database["public"]["Enums"]["entitlement_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          source?: string
          starts_at?: string
          tier?: Database["public"]["Enums"]["entitlement_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          source?: string
          starts_at?: string
          tier?: Database["public"]["Enums"]["entitlement_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      media: {
        Row: {
          alt: string
          caption: string | null
          created_at: string
          height: number
          id: string
          updated_at: string
          uploaded_by: string | null
          url: string
          variants: Json
          width: number
        }
        Insert: {
          alt: string
          caption?: string | null
          created_at?: string
          height: number
          id?: string
          updated_at?: string
          uploaded_by?: string | null
          url: string
          variants?: Json
          width: number
        }
        Update: {
          alt?: string
          caption?: string | null
          created_at?: string
          height?: number
          id?: string
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          variants?: Json
          width?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          id: string
          is_2fa_enabled: boolean
          is_active: boolean
          last_login_at: string | null
          name: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          id: string
          is_2fa_enabled?: boolean
          is_active?: boolean
          last_login_at?: string | null
          name: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          id?: string
          is_2fa_enabled?: boolean
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      sections: {
        Row: {
          chip_bg: string
          chip_fg: string
          created_at: string
          descriptor: string | null
          id: string
          is_active: boolean
          name: string
          nav_order: number
          slug: string
          updated_at: string
        }
        Insert: {
          chip_bg: string
          chip_fg: string
          created_at?: string
          descriptor?: string | null
          id?: string
          is_active?: boolean
          name: string
          nav_order: number
          slug: string
          updated_at?: string
        }
        Update: {
          chip_bg?: string
          chip_fg?: string
          created_at?: string
          descriptor?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nav_order?: number
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      units: {
        Row: {
          abbreviation: string
          base_multiplier: number
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          abbreviation: string
          base_multiplier: number
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string
          base_multiplier?: number
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_edit_media: {
        Args: { uid: string; uploader: string }
        Returns: boolean
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_admin_or_editor: { Args: { uid: string }; Returns: boolean }
      is_staff: { Args: { uid: string }; Returns: boolean }
    }
    Enums: {
      entitlement_tier: "free" | "paid"
      user_role: "admin" | "editor" | "contributor" | "analyst"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      entitlement_tier: ["free", "paid"],
      user_role: ["admin", "editor", "contributor", "analyst"],
    },
  },
} as const
