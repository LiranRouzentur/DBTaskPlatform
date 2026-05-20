using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskPlatform.Data.migrations
{
    
    public partial class RedesignStatusFieldKindAsLookupAndDropJsonValue : Migration
    {
        
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            
            migrationBuilder.CreateTable(
                name: "StatusFieldKinds",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Kind = table.Column<string>(type: "nvarchar(32)", maxLength: 32, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusFieldKinds", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StatusFieldKinds_Kind",
                table: "StatusFieldKinds",
                column: "Kind",
                unique: true);

            migrationBuilder.Sql(@"
                INSERT INTO StatusFieldKinds (Id, Kind) VALUES (1, 'String');
                INSERT INTO StatusFieldKinds (Id, Kind) VALUES (2, 'Number');
            ");

            migrationBuilder.AddColumn<int>(
                name: "ItemCount",
                table: "StatusFieldSpecs",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.AddColumn<int>(
                name: "ItemIndex",
                table: "TaskFieldValues",
                type: "int",
                nullable: false,
                defaultValue: 1);

            migrationBuilder.Sql(@"
                UPDATE StatusFieldSpecs SET ItemCount = ISNULL(MaxItems, 1) WHERE Kind = 2;
                UPDATE StatusFieldSpecs SET ItemCount = 1 WHERE Kind IN (1, 3);
            ");

            migrationBuilder.Sql(@"
                -- For each old StringArray field-value row, expand JsonValue into
                -- the StringValue column (item 1) on the original row, then INSERT
                -- additional rows for items 2..N.
                WITH ArrayValues AS (
                    SELECT
                        v.Id            AS OriginalId,
                        v.TaskId        AS TaskId,
                        v.StatusFieldSpecId AS StatusFieldSpecId,
                        v.IsDeleted     AS IsDeleted,
                        j.[value]       AS StringValue,
                        CAST(j.[key] AS int) + 1 AS ItemIndex
                    FROM TaskFieldValues v
                    CROSS APPLY OPENJSON(v.JsonValue) j
                    WHERE v.JsonValue IS NOT NULL AND v.JsonValue <> ''
                )
                UPDATE v
                SET v.StringValue = av.StringValue,
                    v.ItemIndex = 1
                FROM TaskFieldValues v
                INNER JOIN ArrayValues av ON av.OriginalId = v.Id AND av.ItemIndex = 1;

                INSERT INTO TaskFieldValues (TaskId, StatusFieldSpecId, ItemIndex, StringValue, NumberValue, IsDeleted)
                SELECT av.TaskId, av.StatusFieldSpecId, av.ItemIndex, av.StringValue, NULL, av.IsDeleted
                FROM (
                    SELECT
                        v.TaskId, v.StatusFieldSpecId, v.IsDeleted,
                        j.[value] AS StringValue,
                        CAST(j.[key] AS int) + 1 AS ItemIndex
                    FROM TaskFieldValues v
                    CROSS APPLY OPENJSON(v.JsonValue) j
                    WHERE v.JsonValue IS NOT NULL AND v.JsonValue <> ''
                ) av
                WHERE av.ItemIndex > 1;
            ");

            migrationBuilder.Sql(@"
                UPDATE StatusFieldSpecs SET Kind = 1 WHERE Kind = 2;  -- StringArray → String
                UPDATE StatusFieldSpecs SET Kind = 2 WHERE Kind = 3;  -- Number renumbered
            ");

            migrationBuilder.RenameColumn(
                name: "Kind",
                table: "StatusFieldSpecs",
                newName: "KindId");

            migrationBuilder.RenameColumn(
                name: "MinItems",
                table: "StatusFieldSpecs",
                newName: "Min");

            migrationBuilder.RenameColumn(
                name: "MaxItems",
                table: "StatusFieldSpecs",
                newName: "Max");

            migrationBuilder.Sql(@"
                UPDATE StatusFieldSpecs SET Min = 1, Max = 150
                    WHERE KindId = 1 AND Min IS NULL;
                UPDATE StatusFieldSpecs SET Min = 1, Max = 10000
                    WHERE KindId = 2 AND Min IS NULL;
            ");

            migrationBuilder.DropColumn(
                name: "JsonValue",
                table: "TaskFieldValues");

            migrationBuilder.DropColumn(
                name: "Required",
                table: "StatusFieldSpecs");

            migrationBuilder.DropIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId_ItemIndex",
                table: "TaskFieldValues",
                columns: new[] { "TaskId", "StatusFieldSpecId", "ItemIndex" },
                unique: true,
                filter: "[IsDeleted] IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_StatusFieldSpecs_KindId",
                table: "StatusFieldSpecs",
                column: "KindId");

            migrationBuilder.AddForeignKey(
                name: "FK_StatusFieldSpecs_StatusFieldKinds_KindId",
                table: "StatusFieldSpecs",
                column: "KindId",
                principalTable: "StatusFieldKinds",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            
            migrationBuilder.DropForeignKey(
                name: "FK_StatusFieldSpecs_StatusFieldKinds_KindId",
                table: "StatusFieldSpecs");

            migrationBuilder.DropIndex(
                name: "IX_StatusFieldSpecs_KindId",
                table: "StatusFieldSpecs");

            migrationBuilder.DropIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId_ItemIndex",
                table: "TaskFieldValues");

            migrationBuilder.DropTable(name: "StatusFieldKinds");

            migrationBuilder.AddColumn<string>(
                name: "JsonValue",
                table: "TaskFieldValues",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<bool>(
                name: "Required",
                table: "StatusFieldSpecs",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.RenameColumn(
                name: "Min",
                table: "StatusFieldSpecs",
                newName: "MinItems");

            migrationBuilder.RenameColumn(
                name: "Max",
                table: "StatusFieldSpecs",
                newName: "MaxItems");

            migrationBuilder.RenameColumn(
                name: "KindId",
                table: "StatusFieldSpecs",
                newName: "Kind");

            migrationBuilder.Sql(@"
                UPDATE StatusFieldSpecs SET Kind = 3 WHERE Kind = 2;
                UPDATE StatusFieldSpecs SET Kind = 2 WHERE Kind = 1 AND ItemCount > 1;
            ");

            migrationBuilder.DropColumn(
                name: "ItemCount",
                table: "StatusFieldSpecs");

            migrationBuilder.DropColumn(
                name: "ItemIndex",
                table: "TaskFieldValues");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues",
                columns: new[] { "TaskId", "StatusFieldSpecId" },
                unique: true,
                filter: "[IsDeleted] IS NULL");
        }
    }
}
