# Build stage — .NET 10 SDK compiles + publishes the API.
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

# Copy csproj manifests first so docker layer-caches the NuGet restore.
COPY server/api/Api.csproj api/
COPY server/application/Application.csproj application/
COPY server/domain/Domain.csproj domain/
COPY server/data/Data.csproj data/

RUN dotnet restore api/Api.csproj

# Copy the rest of the server sources.
COPY server/ .

WORKDIR /src/api
RUN dotnet publish -c Release -o /app/publish /p:UseAppHost=false

# Runtime stage — slim ASP.NET image.
FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app/publish .

EXPOSE 8080
ENTRYPOINT ["dotnet", "Api.dll"]
