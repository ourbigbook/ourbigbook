-- Rename old column out of the way
ALTER TABLE "Ref" RENAME COLUMN "defined_at" TO "defined_at_bak";
ALTER INDEX "ref_defined_at_defined_at_line_defined_at_col_type" RENAME TO "ref_defined_at_bak_defined_at_line_defined_at_col_type";
ALTER INDEX "ref_from_id_defined_at_to_id_type" RENAME TO "ref_from_id_defined_at_bak_to_id_type";

-- Create the new column
ALTER TABLE "Ref" ADD COLUMN "defined_at" INTEGER CONSTRAINT "Ref_defined_at_fkey" REFERENCES "File" (id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "ref_defined_at_defined_at_line_defined_at_col_type" ON "Ref" (defined_at, defined_at_line, defined_at_col, type);
CREATE INDEX "ref_from_id_defined_at_to_id_type"  ON "Ref" (from_id, defined_at, to_id, type);

-- Update values of the new column
UPDATE "Ref" SET defined_at = "File".id FROM "File" WHERE "File"."path" = "Ref".defined_at_bak;

-- Destroy the old column
DROP INDEX "ref_defined_at_bak_defined_at_line_defined_at_col_type";
DROP INDEX "ref_from_id_defined_at_bak_to_id_type";
ALTER TABLE "Ref" DROP COLUMN "defined_at_bak";

-- Rename Id.path string to Id.defined_at reference to File

-- Create the new column
ALTER TABLE "Id" ADD COLUMN "defined_at" INTEGER CONSTRAINT "Id_defined_at_fkey" REFERENCES "File" (id) ON UPDATE CASCADE ON DELETE CASCADE;
CREATE INDEX "id_defined_at" ON "Id" (defined_at);

-- Update values of the new column
UPDATE "Id" SET defined_at = "File".id FROM "File" WHERE "File"."path" = "Id"."path";

-- Destroy the old column
DROP INDEX "id_path";
ALTER TABLE "Id" DROP COLUMN "path";

-- The database had been corrupted by a synonym attempt before that was implemented.
DELETE FROM "Id" WHERE id IN (14110, 16293);

-- Allow Article.file to be NULL
ALTER TABLE "Article" ALTER "fileId" DROP NOT NULL;

-- change Article -> File ON DELETE CASCQADE to SET NULL
ALTER TABLE "Article"
  DROP CONSTRAINT "Article_fileId_fkey",
  ADD CONSTRAINT "Article_fileId_fkey"
     FOREIGN KEY ("fileId")
     REFERENCES "File"("id")
     ON UPDATE CASCADE ON DELETE SET NULL;

-- change Render -> File ON DELETE SET NULL to CASCADE
ALTER TABLE "Render"
  DROP CONSTRAINT "Render_fileId_fkey",
  ADD CONSTRAINT "Render_fileId_fkey"
     FOREIGN KEY ("fileId")
     REFERENCES "File"("id")
     ON UPDATE CASCADE ON DELETE CASCADE;

-- Found this random inconsistency.
ALTER TABLE "UserLikeIssue" RENAME COLUMN "articleId" TO "issueId";

-- Get rid of uppercase IDs. Now forbidden more explicitly.
update "Id" set idid = lower(idid) where idid != lower(idid)
update "Id" set ast_json = '{"macro_name":"H","node_type":"MACRO","scope":"@cirosantilli","source_location":{"line":5,"column":1,"path":"@cirosantilli/Ł.bigb"},"subdir":"","first_toplevel_child":false,"is_first_header_in_input_file":false,"split_default":false,"synonym":"@cirosantilli/ł","word_count":0,"args":{"level":{"asts":[{"macro_name":"plaintext","node_type":"PLAINTEXT","scope":"@cirosantilli","source_location":{"line":5,"column":1,"path":"@cirosantilli/Ł.bigb"},"text":"1","first_toplevel_child":false,"is_first_header_in_input_file":true,"split_default":false,"word_count":0,"args":{},"header_tree_node_word_count":0}],"source_location":{"line":5,"column":1,"path":"@cirosantilli/Ł.bigb"}},"title":{"asts":[{"macro_name":"plaintext","node_type":"PLAINTEXT","scope":"@cirosantilli","source_location":{"line":5,"column":3,"path":"@cirosantilli/Ł.bigb"},"text":"L with a stroke","first_toplevel_child":false,"is_first_header_in_input_file":true,"split_default":false,"word_count":4,"args":{},"header_tree_node_word_count":4}],"source_location":{"line":5,"column":1,"path":"@cirosantilli/Ł.bigb"}},"synonym":{"asts":[],"source_location":{"line":6,"column":1,"path":"@cirosantilli/Ł.bigb"}},"title2":{"asts":[],"source_location":{"line":7,"column":1,"path":"@cirosantilli/Ł.bigb"}}},"header_tree_node_word_count":15}' where idid = lower('@cirosantilli/l-with-a-stroke');
update "Ref" set from_id = lower(from_id) where from_id != lower(from_id)
update "Ref" set to_id = lower(to_id) where to_id != lower(to_id)
update "Article" set "topicId" = 'ł' where lower(slug) = 'cirosantilli/ł';
update "Article" set "topicId" = 'ł' where lower(slug) = 'cirosantilli/ł';
update "File" set path = '@cirosantilli/ł.bigb', toplevel_id = '@cirosantilli/ł' where lower(toplevel_id) = '@cirosantilli/ł';
