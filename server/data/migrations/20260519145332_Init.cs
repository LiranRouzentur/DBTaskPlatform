using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace TaskPlatform.Data.migrations
{
    
    public partial class Init : Migration
    {
        
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "TaskTypes",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskTypes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    FullName = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "StatusDefinitions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    TaskTypeId = table.Column<int>(type: "int", nullable: false),
                    Code = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "int", nullable: false),
                    IsFinal = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusDefinitions", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatusDefinitions_TaskTypes_TaskTypeId",
                        column: x => x.TaskTypeId,
                        principalTable: "TaskTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "StatusFieldSpecs",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false),
                    StatusDefinitionId = table.Column<int>(type: "int", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    Required = table.Column<bool>(type: "bit", nullable: false),
                    MinItems = table.Column<int>(type: "int", nullable: true),
                    MaxItems = table.Column<int>(type: "int", nullable: true),
                    Position = table.Column<int>(type: "int", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StatusFieldSpecs", x => x.Id);
                    table.ForeignKey(
                        name: "FK_StatusFieldSpecs_StatusDefinitions_StatusDefinitionId",
                        column: x => x.StatusDefinitionId,
                        principalTable: "StatusDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "TaskItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskTypeId = table.Column<int>(type: "int", nullable: false),
                    CurrentStatusDefinitionId = table.Column<int>(type: "int", nullable: false),
                    IsClosed = table.Column<bool>(type: "bit", nullable: false),
                    CurrentAssignedUserId = table.Column<int>(type: "int", nullable: false),
                    RowVersion = table.Column<byte[]>(type: "rowversion", rowVersion: true, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskItems", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskItems_StatusDefinitions_CurrentStatusDefinitionId",
                        column: x => x.CurrentStatusDefinitionId,
                        principalTable: "StatusDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskItems_TaskTypes_TaskTypeId",
                        column: x => x.TaskTypeId,
                        principalTable: "TaskTypes",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskItems_Users_CurrentAssignedUserId",
                        column: x => x.CurrentAssignedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TaskAssignments",
                columns: table => new
                {
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    StatusDefinitionId = table.Column<int>(type: "int", nullable: false),
                    AssignedUserId = table.Column<int>(type: "int", nullable: false),
                    AssignedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskAssignments", x => new { x.TaskId, x.StatusDefinitionId });
                    table.ForeignKey(
                        name: "FK_TaskAssignments_StatusDefinitions_StatusDefinitionId",
                        column: x => x.StatusDefinitionId,
                        principalTable: "StatusDefinitions",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskAssignments_TaskItems_TaskId",
                        column: x => x.TaskId,
                        principalTable: "TaskItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_TaskAssignments_Users_AssignedUserId",
                        column: x => x.AssignedUserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "TaskFieldValues",
                columns: table => new
                {
                    Id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    TaskId = table.Column<int>(type: "int", nullable: false),
                    StatusFieldSpecId = table.Column<int>(type: "int", nullable: false),
                    StringValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    NumberValue = table.Column<decimal>(type: "decimal(18,2)", precision: 18, scale: 2, nullable: true),
                    JsonValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                    IsDeleted = table.Column<bool>(type: "bit", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_TaskFieldValues", x => x.Id);
                    table.ForeignKey(
                        name: "FK_TaskFieldValues_StatusFieldSpecs_StatusFieldSpecId",
                        column: x => x.StatusFieldSpecId,
                        principalTable: "StatusFieldSpecs",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_TaskFieldValues_TaskItems_TaskId",
                        column: x => x.TaskId,
                        principalTable: "TaskItems",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_TaskTypeId_Code",
                table: "StatusDefinitions",
                columns: new[] { "TaskTypeId", "Code" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StatusDefinitions_TaskTypeId_Position",
                table: "StatusDefinitions",
                columns: new[] { "TaskTypeId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StatusFieldSpecs_StatusDefinitionId_Name",
                table: "StatusFieldSpecs",
                columns: new[] { "StatusDefinitionId", "Name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_StatusFieldSpecs_StatusDefinitionId_Position",
                table: "StatusFieldSpecs",
                columns: new[] { "StatusDefinitionId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskAssignments_AssignedUserId",
                table: "TaskAssignments",
                column: "AssignedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskAssignments_StatusDefinitionId",
                table: "TaskAssignments",
                column: "StatusDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_StatusFieldSpecId",
                table: "TaskFieldValues",
                column: "StatusFieldSpecId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskFieldValues_TaskId_StatusFieldSpecId",
                table: "TaskFieldValues",
                columns: new[] { "TaskId", "StatusFieldSpecId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_TaskItems_CurrentAssignedUserId",
                table: "TaskItems",
                column: "CurrentAssignedUserId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskItems_CurrentAssignedUserId_IsClosed",
                table: "TaskItems",
                columns: new[] { "CurrentAssignedUserId", "IsClosed" });

            migrationBuilder.CreateIndex(
                name: "IX_TaskItems_CurrentStatusDefinitionId",
                table: "TaskItems",
                column: "CurrentStatusDefinitionId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskItems_TaskTypeId",
                table: "TaskItems",
                column: "TaskTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_TaskTypes_Name",
                table: "TaskTypes",
                column: "Name",
                unique: true);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "TaskAssignments");

            migrationBuilder.DropTable(
                name: "TaskFieldValues");

            migrationBuilder.DropTable(
                name: "StatusFieldSpecs");

            migrationBuilder.DropTable(
                name: "TaskItems");

            migrationBuilder.DropTable(
                name: "StatusDefinitions");

            migrationBuilder.DropTable(
                name: "Users");

            migrationBuilder.DropTable(
                name: "TaskTypes");
        }
    }
}
