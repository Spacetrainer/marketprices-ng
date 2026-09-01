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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      article_tags: {
        Row: {
          article_id: string
          tag_id: string
        }
        Insert: {
          article_id: string
          tag_id: string
        }
        Update: {
          article_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "article_tags_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "article_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      articles: {
        Row: {
          agent_assisted: boolean
          author_id: string
          body: string
          canonical_url: string | null
          content_item_id: string
          country: string
          dek: string | null
          header_alt: string
          header_media_id: string
          id: string
          published_at: string | null
          published_by: string | null
          read_time: number | null
          scheduled_for: string | null
          section_id: string
          seo_description: string | null
          seo_title: string | null
          slug: string
          status: string
          title: string
          type: string
          updated_at: string
          view_count: number | null
          youtube_id: string | null
        }
        Insert: {
          agent_assisted: boolean
          author_id: string
          body: string
          canonical_url?: string | null
          content_item_id: string
          country?: string
          dek?: string | null
          header_alt: string
          header_media_id: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          read_time?: number | null
          scheduled_for?: string | null
          section_id: string
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          status: string
          title: string
          type: string
          updated_at?: string
          view_count?: number | null
          youtube_id?: string | null
        }
        Update: {
          agent_assisted?: boolean
          author_id?: string
          body?: string
          canonical_url?: string | null
          content_item_id?: string
          country?: string
          dek?: string | null
          header_alt?: string
          header_media_id?: string
          id?: string
          published_at?: string | null
          published_by?: string | null
          read_time?: number | null
          scheduled_for?: string | null
          section_id?: string
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          view_count?: number | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_content_item_fk"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_header_media_id_fkey"
            columns: ["header_media_id"]
            isOneToOne: false
            referencedRelation: "media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "articles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          diff: Json
          entity_id: string
          entity_type: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          diff: Json
          entity_id: string
          entity_type: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          diff?: Json
          entity_id?: string
          entity_type?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      basket_definition: {
        Row: {
          active_from: string
          base_iso_week: number
          base_iso_year: number
          commodity_id: string
          created_at: string
          id: string
          quantity: number
          sub_index: string
          unit_id: string
          version: number
        }
        Insert: {
          active_from: string
          base_iso_week: number
          base_iso_year: number
          commodity_id: string
          created_at?: string
          id?: string
          quantity: number
          sub_index: string
          unit_id: string
          version: number
        }
        Update: {
          active_from?: string
          base_iso_week?: number
          base_iso_year?: number
          commodity_id?: string
          created_at?: string
          id?: string
          quantity?: number
          sub_index?: string
          unit_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "basket_definition_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "basket_definition_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      basket_snapshots: {
        Row: {
          base_iso_week: number
          base_iso_year: number
          basket_cost_naira: number | null
          basket_index: number | null
          basket_version: number
          computed_at: string
          created_at: string
          id: string
          is_complete: boolean
          iso_week: number
          iso_year: number
          missing_commodity_ids: string[]
          sub_index_values: Json | null
          wow_pct: number | null
          yoy_pct: number | null
        }
        Insert: {
          base_iso_week: number
          base_iso_year: number
          basket_cost_naira?: number | null
          basket_index?: number | null
          basket_version: number
          computed_at?: string
          created_at?: string
          id?: string
          is_complete?: boolean
          iso_week: number
          iso_year: number
          missing_commodity_ids?: string[]
          sub_index_values?: Json | null
          wow_pct?: number | null
          yoy_pct?: number | null
        }
        Update: {
          base_iso_week?: number
          base_iso_year?: number
          basket_cost_naira?: number | null
          basket_index?: number | null
          basket_version?: number
          computed_at?: string
          created_at?: string
          id?: string
          is_complete?: boolean
          iso_week?: number
          iso_year?: number
          missing_commodity_ids?: string[]
          sub_index_values?: Json | null
          wow_pct?: number | null
          yoy_pct?: number | null
        }
        Relationships: []
      }
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
      content_items: {
        Row: {
          angle_note: string | null
          anomaly_ids: string[]
          archetype: string
          body_mdx: string | null
          caption_file_url: string | null
          country: string | null
          created_at: string
          created_by: string
          data_blocks: Json | null
          dek: string | null
          explanation_load: number | null
          format: string
          format_overridden: boolean
          header_alt: string | null
          header_render_urls: Json | null
          header_template: string
          header_template_vars: Json | null
          headline: string | null
          headline_hypothesis: string
          id: string
          insight_type: string
          no_distribution: boolean
          override_reason: string | null
          priority: number | null
          progression: number | null
          published_article_id: string | null
          published_at: string | null
          punch: number | null
          recommended_format: string | null
          runtime_seconds: number | null
          scene_count: number | null
          scheduled_by: string | null
          scheduled_for: string | null
          script: Json | null
          section_id: string | null
          seo: Json | null
          signal_ids: string[]
          slug: string | null
          source_screen: string
          sources: Json
          stakes: number | null
          status: string
          tags: string[] | null
          verification_log: Json | null
          video_fit: number | null
          video_urls: Json | null
          youtube_id: string | null
        }
        Insert: {
          angle_note?: string | null
          anomaly_ids?: string[]
          archetype: string
          body_mdx?: string | null
          caption_file_url?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          data_blocks?: Json | null
          dek?: string | null
          explanation_load?: number | null
          format: string
          format_overridden?: boolean
          header_alt?: string | null
          header_render_urls?: Json | null
          header_template: string
          header_template_vars?: Json | null
          headline?: string | null
          headline_hypothesis: string
          id?: string
          insight_type: string
          no_distribution?: boolean
          override_reason?: string | null
          priority?: number | null
          progression?: number | null
          published_article_id?: string | null
          published_at?: string | null
          punch?: number | null
          recommended_format?: string | null
          runtime_seconds?: number | null
          scene_count?: number | null
          scheduled_by?: string | null
          scheduled_for?: string | null
          script?: Json | null
          section_id?: string | null
          seo?: Json | null
          signal_ids?: string[]
          slug?: string | null
          source_screen: string
          sources: Json
          stakes?: number | null
          status?: string
          tags?: string[] | null
          verification_log?: Json | null
          video_fit?: number | null
          video_urls?: Json | null
          youtube_id?: string | null
        }
        Update: {
          angle_note?: string | null
          anomaly_ids?: string[]
          archetype?: string
          body_mdx?: string | null
          caption_file_url?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          data_blocks?: Json | null
          dek?: string | null
          explanation_load?: number | null
          format?: string
          format_overridden?: boolean
          header_alt?: string | null
          header_render_urls?: Json | null
          header_template?: string
          header_template_vars?: Json | null
          headline?: string | null
          headline_hypothesis?: string
          id?: string
          insight_type?: string
          no_distribution?: boolean
          override_reason?: string | null
          priority?: number | null
          progression?: number | null
          published_article_id?: string | null
          published_at?: string | null
          punch?: number | null
          recommended_format?: string | null
          runtime_seconds?: number | null
          scene_count?: number | null
          scheduled_by?: string | null
          scheduled_for?: string | null
          script?: Json | null
          section_id?: string | null
          seo?: Json | null
          signal_ids?: string[]
          slug?: string | null
          source_screen?: string
          sources?: Json
          stakes?: number | null
          status?: string
          tags?: string[] | null
          verification_log?: Json | null
          video_fit?: number | null
          video_urls?: Json | null
          youtube_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_header_template_fkey"
            columns: ["header_template"]
            isOneToOne: false
            referencedRelation: "content_templates"
            referencedColumns: ["template_code"]
          },
          {
            foreignKeyName: "content_items_published_article_id_fkey"
            columns: ["published_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_scheduled_by_fkey"
            columns: ["scheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_items_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance: {
        Row: {
          avg_time_seconds: number | null
          clicks: number | null
          collected_at: string
          collected_for_date: string
          content_item_id: string
          follows: number | null
          format: string
          id: string
          impressions: number | null
          platform: string
          read_completion: number | null
          saves: number | null
          search_impressions: number | null
          sessions: number | null
          shares: number | null
          source_system: string
          views: number | null
          watch_through: number | null
        }
        Insert: {
          avg_time_seconds?: number | null
          clicks?: number | null
          collected_at?: string
          collected_for_date: string
          content_item_id: string
          follows?: number | null
          format: string
          id?: string
          impressions?: number | null
          platform: string
          read_completion?: number | null
          saves?: number | null
          search_impressions?: number | null
          sessions?: number | null
          shares?: number | null
          source_system: string
          views?: number | null
          watch_through?: number | null
        }
        Update: {
          avg_time_seconds?: number | null
          clicks?: number | null
          collected_at?: string
          collected_for_date?: string
          content_item_id?: string
          follows?: number | null
          format?: string
          id?: string
          impressions?: number | null
          platform?: string
          read_completion?: number | null
          saves?: number | null
          search_impressions?: number | null
          sessions?: number | null
          shares?: number | null
          source_system?: string
          views?: number | null
          watch_through?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_revisions: {
        Row: {
          content_item_id: string
          created_at: string
          id: string
          payload: Json
          step: string
        }
        Insert: {
          content_item_id: string
          created_at?: string
          id?: string
          payload: Json
          step: string
        }
        Update: {
          content_item_id?: string
          created_at?: string
          id?: string
          payload?: Json
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_revisions_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      content_templates: {
        Row: {
          canva_template_id: string
          created_at: string
          format: string
          id: string
          is_active: boolean
          output_sizes: Json
          template_code: string
          updated_at: string
          variable_schema: Json
        }
        Insert: {
          canva_template_id: string
          created_at?: string
          format: string
          id?: string
          is_active?: boolean
          output_sizes: Json
          template_code: string
          updated_at?: string
          variable_schema: Json
        }
        Update: {
          canva_template_id?: string
          created_at?: string
          format?: string
          id?: string
          is_active?: boolean
          output_sizes?: Json
          template_code?: string
          updated_at?: string
          variable_schema?: Json
        }
        Relationships: []
      }
      daily_rollups: {
        Row: {
          computed_at: string
          date: string
          dimension: string
          dimension_value: string
          metric_key: string
          value: number
        }
        Insert: {
          computed_at?: string
          date: string
          dimension: string
          dimension_value: string
          metric_key: string
          value: number
        }
        Update: {
          computed_at?: string
          date?: string
          dimension?: string
          dimension_value?: string
          metric_key?: string
          value?: number
        }
        Relationships: []
      }
      editorial_rules: {
        Row: {
          active_from: string
          changed_at: string
          changed_by: string | null
          id: string
          is_active: boolean
          key: string
          scope: string
          value: Json
          version: number
        }
        Insert: {
          active_from?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_active?: boolean
          key: string
          scope: string
          value: Json
          version: number
        }
        Update: {
          active_from?: string
          changed_at?: string
          changed_by?: string | null
          id?: string
          is_active?: boolean
          key?: string
          scope?: string
          value?: Json
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "editorial_rules_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      format_overrides: {
        Row: {
          actor: string
          chosen: string
          content_item_id: string
          created_at: string
          id: string
          reason: string
          recommended: string
        }
        Insert: {
          actor: string
          chosen: string
          content_item_id: string
          created_at?: string
          id?: string
          reason: string
          recommended: string
        }
        Update: {
          actor?: string
          chosen?: string
          content_item_id?: string
          created_at?: string
          id?: string
          reason?: string
          recommended?: string
        }
        Relationships: [
          {
            foreignKeyName: "format_overrides_actor_fkey"
            columns: ["actor"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "format_overrides_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      homepage_pins: {
        Row: {
          article_id: string
          expires_at: string
          pinned_at: string
          pinned_by: string
          position: number
          section_id: string
        }
        Insert: {
          article_id: string
          expires_at: string
          pinned_at?: string
          pinned_by: string
          position: number
          section_id: string
        }
        Update: {
          article_id?: string
          expires_at?: string
          pinned_at?: string
          pinned_by?: string
          position?: number
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "homepage_pins_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_pins_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "homepage_pins_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
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
      price_anomalies: {
        Row: {
          baseline_expected: number | null
          commodity_id: string
          comparison_window: string
          detected_at: string
          direction: string | null
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          gap_weeks: number
          id: string
          iso_week: number
          iso_year: number
          pct_change: number | null
          severity: string
          site_switch_flag: boolean
          state: string
          tier: string
          z_score: number | null
        }
        Insert: {
          baseline_expected?: number | null
          commodity_id: string
          comparison_window: string
          detected_at?: string
          direction?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          gap_weeks?: number
          id?: string
          iso_week: number
          iso_year: number
          pct_change?: number | null
          severity: string
          site_switch_flag?: boolean
          state?: string
          tier: string
          z_score?: number | null
        }
        Update: {
          baseline_expected?: number | null
          commodity_id?: string
          comparison_window?: string
          detected_at?: string
          direction?: string | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          gap_weeks?: number
          id?: string
          iso_week?: number
          iso_year?: number
          pct_change?: number | null
          severity?: string
          site_switch_flag?: boolean
          state?: string
          tier?: string
          z_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "price_anomalies_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_anomalies_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      price_observations: {
        Row: {
          collected_at_site_id: string
          collected_on: string
          commodity_id: string
          corrects_id: string | null
          currency: string
          fx_fetched_at: string | null
          fx_rate: number | null
          id: string
          iso_week: number
          iso_year: number
          price: number
          published_at: string
          source: string
          submission_id: string
          superseded_at: string | null
          tier: string
          unit_id: string
          week_start_date: string
        }
        Insert: {
          collected_at_site_id: string
          collected_on: string
          commodity_id: string
          corrects_id?: string | null
          currency?: string
          fx_fetched_at?: string | null
          fx_rate?: number | null
          id?: string
          iso_week: number
          iso_year: number
          price: number
          published_at?: string
          source?: string
          submission_id: string
          superseded_at?: string | null
          tier: string
          unit_id: string
          week_start_date: string
        }
        Update: {
          collected_at_site_id?: string
          collected_on?: string
          commodity_id?: string
          corrects_id?: string | null
          currency?: string
          fx_fetched_at?: string | null
          fx_rate?: number | null
          id?: string
          iso_week?: number
          iso_year?: number
          price?: number
          published_at?: string
          source?: string
          submission_id?: string
          superseded_at?: string | null
          tier?: string
          unit_id?: string
          week_start_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_observations_collected_at_site_id_fkey"
            columns: ["collected_at_site_id"]
            isOneToOne: false
            referencedRelation: "collection_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: true
            referencedRelation: "price_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: true
            referencedRelation: "price_submissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_observations_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
      }
      price_submissions: {
        Row: {
          collected_on: string
          collection_site_id: string
          collector_id: string
          commodity_id: string
          currency: string
          flags: string[]
          id: string
          iso_week: number
          iso_year: number
          notes: string | null
          photo_url: string | null
          price: number
          reject_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          source: string
          status: string
          submitted_at: string
          tier: string
          unit_id: string
          variety: string | null
        }
        Insert: {
          collected_on: string
          collection_site_id: string
          collector_id: string
          commodity_id: string
          currency?: string
          flags?: string[]
          id?: string
          iso_week: number
          iso_year: number
          notes?: string | null
          photo_url?: string | null
          price: number
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_at?: string
          tier: string
          unit_id: string
          variety?: string | null
        }
        Update: {
          collected_on?: string
          collection_site_id?: string
          collector_id?: string
          commodity_id?: string
          currency?: string
          flags?: string[]
          id?: string
          iso_week?: number
          iso_year?: number
          notes?: string | null
          photo_url?: string | null
          price?: number
          reject_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          source?: string
          status?: string
          submitted_at?: string
          tier?: string
          unit_id?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_submissions_collection_site_id_fkey"
            columns: ["collection_site_id"]
            isOneToOne: false
            referencedRelation: "collection_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_submissions_collector_id_fkey"
            columns: ["collector_id"]
            isOneToOne: false
            referencedRelation: "collectors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_submissions_commodity_id_fkey"
            columns: ["commodity_id"]
            isOneToOne: false
            referencedRelation: "commodities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_submissions_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_submissions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["id"]
          },
        ]
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
      raw_items: {
        Row: {
          author: string | null
          body_snippet: string | null
          fetched_at: string
          id: string
          published_at: string | null
          source_id: string
          summary: string | null
          title: string
          title_fingerprint: string | null
          url: string
          url_hash: string
        }
        Insert: {
          author?: string | null
          body_snippet?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          source_id: string
          summary?: string | null
          title: string
          title_fingerprint?: string | null
          url: string
          url_hash: string
        }
        Update: {
          author?: string | null
          body_snippet?: string | null
          fetched_at?: string
          id?: string
          published_at?: string | null
          source_id?: string
          summary?: string | null
          title?: string
          title_fingerprint?: string | null
          url?: string
          url_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "raw_items_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
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
      signals: {
        Row: {
          category: string
          category_weight: number | null
          commodities: string[]
          commodity_match: number | null
          created_at: string
          decision_utility: number | null
          dismiss_reason: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          entities: Json | null
          geo_scope: string | null
          geo_score: number | null
          id: string
          novelty_score: number | null
          raw_item_id: string
          recency_score: number | null
          scored_at: string
          signal_score: number | null
          state: string
          utility_breakdown: Json
        }
        Insert: {
          category: string
          category_weight?: number | null
          commodities?: string[]
          commodity_match?: number | null
          created_at?: string
          decision_utility?: number | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          entities?: Json | null
          geo_scope?: string | null
          geo_score?: number | null
          id?: string
          novelty_score?: number | null
          raw_item_id: string
          recency_score?: number | null
          scored_at?: string
          signal_score?: number | null
          state?: string
          utility_breakdown: Json
        }
        Update: {
          category?: string
          category_weight?: number | null
          commodities?: string[]
          commodity_match?: number | null
          created_at?: string
          decision_utility?: number | null
          dismiss_reason?: string | null
          dismissed_at?: string | null
          dismissed_by?: string | null
          entities?: Json | null
          geo_scope?: string | null
          geo_score?: number | null
          id?: string
          novelty_score?: number | null
          raw_item_id?: string
          recency_score?: number | null
          scored_at?: string
          signal_score?: number | null
          state?: string
          utility_breakdown?: Json
        }
        Relationships: [
          {
            foreignKeyName: "signals_dismissed_by_fkey"
            columns: ["dismissed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signals_raw_item_id_fkey"
            columns: ["raw_item_id"]
            isOneToOne: true
            referencedRelation: "raw_items"
            referencedColumns: ["id"]
          },
        ]
      }
      site_events: {
        Row: {
          content_item_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          published_article_id: string | null
          referrer: string | null
          session_id: string
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          content_item_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          published_article_id?: string | null
          referrer?: string | null
          session_id: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          content_item_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          published_article_id?: string | null
          referrer?: string | null
          session_id?: string
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_events_content_item_id_fkey"
            columns: ["content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_events_published_article_id_fkey"
            columns: ["published_article_id"]
            isOneToOne: false
            referencedRelation: "articles"
            referencedColumns: ["id"]
          },
        ]
      }
      sources: {
        Row: {
          cadence_minutes: number
          created_at: string
          feed_url: string | null
          id: string
          is_active: boolean
          last_error: string | null
          last_polled_at: string | null
          name: string
          region: string
          trust_tier: string
          type: string
          updated_at: string
        }
        Insert: {
          cadence_minutes: number
          created_at?: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name: string
          region: string
          trust_tier: string
          type: string
          updated_at?: string
        }
        Update: {
          cadence_minutes?: number
          created_at?: string
          feed_url?: string | null
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_polled_at?: string | null
          name?: string
          region?: string
          trust_tier?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
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
      videos: {
        Row: {
          description: string | null
          duration_seconds: number | null
          id: string
          imported_content_item_id: string | null
          last_synced_at: string
          thumbnail_url: string | null
          title: string
          view_count: number | null
          youtube_id: string
          youtube_published_at: string | null
        }
        Insert: {
          description?: string | null
          duration_seconds?: number | null
          id?: string
          imported_content_item_id?: string | null
          last_synced_at?: string
          thumbnail_url?: string | null
          title: string
          view_count?: number | null
          youtube_id: string
          youtube_published_at?: string | null
        }
        Update: {
          description?: string | null
          duration_seconds?: number | null
          id?: string
          imported_content_item_id?: string | null
          last_synced_at?: string
          thumbnail_url?: string | null
          title?: string
          view_count?: number | null
          youtube_id?: string
          youtube_published_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_content_item_fk"
            columns: ["imported_content_item_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      weight_proposals: {
        Row: {
          current_value: number
          decided_at: string | null
          decided_by: string | null
          evidence: Json
          id: string
          key: string
          proposed_at: string
          proposed_value: number
          sample_size: number
          scope: string
          status: string
        }
        Insert: {
          current_value: number
          decided_at?: string | null
          decided_by?: string | null
          evidence: Json
          id?: string
          key: string
          proposed_at?: string
          proposed_value: number
          sample_size: number
          scope: string
          status?: string
        }
        Update: {
          current_value?: number
          decided_at?: string | null
          decided_by?: string | null
          evidence?: Json
          id?: string
          key?: string
          proposed_at?: string
          proposed_value?: number
          sample_size?: number
          scope?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "weight_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_author: { Args: { uid: string }; Returns: boolean }
      can_edit_media: {
        Args: { uid: string; uploader: string }
        Returns: boolean
      }
      can_promote: { Args: { uid: string }; Returns: boolean }
      can_view_audit_log: { Args: { uid?: string }; Returns: boolean }
      dismiss_price_anomaly: {
        Args: { anomaly_id: string; reason: string }
        Returns: undefined
      }
      dismiss_signal: {
        Args: { reason: string; signal_id: string }
        Returns: undefined
      }
      format_override_state: {
        Args: { p_exclude?: string; p_item: string }
        Returns: {
          is_overridden: boolean
          latest_at: string
          latest_chosen: string
          latest_reason: string
          latest_recommended: string
          log_rows: number
        }[]
      }
      is_admin: { Args: { uid: string }; Returns: boolean }
      is_admin_or_editor: { Args: { uid: string }; Returns: boolean }
      is_staff: { Args: { uid: string }; Returns: boolean }
      link_video_to_content_item: {
        Args: { content_item_id: string; video_id: string }
        Returns: undefined
      }
      promote_price_anomaly: {
        Args: { anomaly_id: string }
        Returns: undefined
      }
      promote_signal: { Args: { signal_id: string }; Returns: undefined }
      set_editorial_rule: {
        Args: { p_key: string; p_scope: string; p_value: Json }
        Returns: string
      }
      supersede_price_observation: {
        Args: { observation_id: string }
        Returns: undefined
      }
      write_audit_entry: {
        Args: {
          p_action: string
          p_actor_id: string
          p_diff: Json
          p_entity_id: string
          p_entity_type: string
        }
        Returns: string
      }
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
